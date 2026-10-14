import { LucideIcon } from "lucide-react";
import {
  Building,
  Zap,
  Handshake,
  LayoutDashboard,
  Users,
  Settings,
  Network,
  UserCog,
  AlertTriangle,
  HelpCircle,
  UsersRound,
  Crosshair,
  FileText,
  Megaphone,
  Shield,
  Target,
  FileCheck,
  BookOpen,
  Package,
  Layers,
  LayoutGrid,
  Ruler,
  Tag,
  PackageOpen,
  Wrench,
  ListTree,
  DollarSign,
  Truck,
  ShoppingCart,
  Warehouse,
  BarChart3,
  Mail,
  Trash2,
  FileDown,
  ShieldAlert,
  ClipboardCheck,
  ListChecks,
  Receipt,
  Sun,
  ScanBarcode,
  ArrowLeftRight,
  TrendingUp,
  IdCard,
  CalendarDays,
  CalendarRange,
  Clock,
  FolderOpen,
  MapPin,
  Hourglass,
} from "lucide-react";
import type { InventoryCounterKey } from "@/hooks/useInventoryToday";

export interface MenuItem {
  to: string;
  icon: LucideIcon;
  labelKey: string;
  permission?: string;
  permissions?: string[];
  /** When `permissions` is set, require ALL of them instead of the default ANY (OR) logic. */
  requireAll?: boolean;
  /**
   * Contador opcional (pílula no painel do menu), alimentado por
   * useInventoryToday. Zero ou null = sem pílula. Não mexe no alerta do rail.
   */
  counterKey?: InventoryCounterKey;
}

export interface MenuSubSection {
  key: string;
  labelKey: string;
  items: MenuItem[];
  /** Abre já expandida no painel (o utilizador pode fechá-la). */
  defaultExpanded?: boolean;
}

export interface MenuSection {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  paths: string[];
  permissions: string[];
  items: MenuItem[];
  subSections?: MenuSubSection[];
}

export interface TopLevelItem {
  id: string;
  to: string;
  icon: LucideIcon;
  labelKey: string;
  permissions: string[];
  /**
   * Destino servido por outra aplicação no mesmo domínio (ex.: /operacao).
   * O react-router não o conhece, por isso a navegação tem de ser um
   * carregamento de página a sério — ver AppSidebar.handleTopLevelClick.
   */
  external?: boolean;
  /**
   * Só aparece a administradores (`super_admin` / `system_admin`), qualquer que
   * seja a permissão. Para páginas ainda não prontas para toda a gente: sem
   * isto, o item aparecia a todos e só bloqueava ao clicar.
   */
  adminOnly?: boolean;
}

export const topLevelItems: TopLevelItem[] = [
  {
    // "Hoje" (/home): o primeiro ecrã depois do login — o que a pessoa tem de
    // fazer agora. Fica no topo do rail, antes de tudo o resto.
    id: "home",
    to: "/home",
    icon: Sun,
    labelKey: "sidebar.today",
    permissions: [],
  },
  {
    id: "dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    labelKey: "sidebar.dashboard",
    permissions: ["dashboard.view"],
  },
  {
    // Destino diário de um comercial: item plano no rail, como o Dashboard,
    // e não um submenu.
    id: "atividades",
    to: "/atividades",
    icon: ListChecks,
    labelKey: "sidebar.activities",
    // Já não é só de administradores: a página mostra sempre e só o dia da
    // própria pessoa (useMyDay / useMyDayTasks), por isso o comercial vê o seu.
    permissions: ["scheduling.items.view"],
  },
  {
    id: "operacao",
    to: "/operacao",
    icon: Wrench,
    labelKey: "sidebar.operations",
    permissions: ["operations.view"],
    external: true,
  },
];

export const menuSections: MenuSection[] = [
  {
    id: "organizations",
    icon: Building,
    labelKey: "sidebar.organizations",
    paths: ["/organizations", "/org-templates", "/org-chart", "/org-help", "/flow-builder", "/brands", "/bundles", "/products", "/product-categories", "/product-subcategories", "/product-attributes", "/units-of-measure", "/services", "/service-catalog", "/service-categories", "/service-subcategories", "/service-fees"],
    permissions: ["organizations.view", "products.view", "services.view"],
    items: [
      { to: "/organizations", icon: Building, labelKey: "sidebar.organizations", permission: "organizations.view" },
      { to: "/org-chart", icon: Network, labelKey: "sidebar.orgChart", permission: "organizations.view" },
      { to: "/flow-builder", icon: Zap, labelKey: "sidebar.flowBuilder", permission: "flow_builder.view" },
      { to: "/org-help", icon: HelpCircle, labelKey: "sidebar.help", permission: "organizations.view" },
    ],
    subSections: [
      {
        key: "products",
        labelKey: "sidebar.products",
        items: [
          { to: "/products", icon: Package, labelKey: "sidebar.productsList", permission: "products.view" },
          { to: "/bundles", icon: PackageOpen, labelKey: "sidebar.bundles", permission: "products.view" },
          { to: "/brands", icon: Tag, labelKey: "sidebar.brands", permission: "products.view" },
          { to: "/product-categories", icon: Layers, labelKey: "sidebar.productCategories", permission: "products.view" },
          { to: "/product-subcategories", icon: LayoutGrid, labelKey: "sidebar.productSubcategories", permission: "products.view" },
          { to: "/product-attributes", icon: Tag, labelKey: "sidebar.productAttributes", permission: "products.view" },
          { to: "/units-of-measure", icon: Ruler, labelKey: "sidebar.unitsOfMeasure", permission: "products.view" },
        ],
      },
      {
        key: "services",
        labelKey: "sidebar.services",
        items: [
          { to: "/services", icon: Wrench, labelKey: "sidebar.services", permission: "services.view" },
          { to: "/service-categories", icon: ListTree, labelKey: "sidebar.serviceCategories", permission: "services.view" },
          { to: "/service-subcategories", icon: LayoutGrid, labelKey: "sidebar.serviceSubcategories", permission: "services.view" },
          { to: "/service-fees", icon: DollarSign, labelKey: "sidebar.serviceFees", permission: "services.view" },
        ],
      },
    ],
  },
  {
    id: "crm",
    icon: UsersRound,
    labelKey: "sidebar.crm",
    paths: ["/pessoas", "/leads", "/leads/pending-submissions", "/clients"],
    permissions: ["leads.view", "clients.view"],
    items: [
      { to: "/pessoas", icon: UsersRound, labelKey: "sidebar.people", permission: "leads.view" },
      { to: "/leads", icon: Target, labelKey: "sidebar.leads", permission: "leads.view" },
      { to: "/leads/pending-submissions", icon: FileText, labelKey: "sidebar.pendingSubmissions", permission: "platform.pending_submissions.view" },
      { to: "/clients", icon: Building, labelKey: "sidebar.clients", permission: "clients.view" },
    ],
  },
  {
    id: "acquisition",
    icon: Target,
    labelKey: "sidebar.acquisition",
    paths: ["/deals", "/negocio-metas", "/proposals", "/quotes", "/quote-models", "/quote-templates", "/modelos-orcamento", "/proposal-templates", "/direct-sales", "/client-contracts", "/contract-templates", "/acquisition-help", "/needs-assessment-config"],
    permissions: ["deals.view", "proposals.view", "quotes.view", "direct_sales.view"],
    items: [
      { to: "/deals", icon: Handshake, labelKey: "sidebar.proposalRequests", permission: "deals.view" },
      // Exemplo estático por agora; mesma permissão dos Pedidos de Proposta.
      { to: "/negocio-metas", icon: TrendingUp, labelKey: "sidebar.businessGoals", permission: "deals.view" },
    ],
    subSections: [
      {
        key: "proposals",
        labelKey: "sidebar.proposals",
        items: [
          { to: "/proposals", icon: FileText, labelKey: "sidebar.proposals", permission: "proposals.view" },
          { to: "/quotes", icon: FileCheck, labelKey: "sidebar.quotes", permission: "quotes.view" },
        ],
      },
      // Venda Direta (Fase 2): fluxo alternativo, mais leve, ao caminho
      // Orçamento -> Proposta -> Contrato. Fica entre "proposals" e
      // "contracts" porque é exatamente aí que entra no percurso comercial —
      // substitui a proposta e dispensa o contrato.
      {
        key: "direct-sale",
        labelKey: "sidebar.directSale",
        items: [
          { to: "/direct-sales", icon: Receipt, labelKey: "sidebar.directSales", permission: "direct_sales.view" },
        ],
      },
      {
        key: "contracts",
        labelKey: "sidebar.contracts",
        items: [
          { to: "/client-contracts", icon: BookOpen, labelKey: "sidebar.contracts", permission: "deals.view" },
        ],
      },
      {
        key: "acquisition-config",
        labelKey: "sidebar.settings",
        items: [
          { to: "/acquisition-help", icon: HelpCircle, labelKey: "sidebar.acquisitionHelp" },
        ],
      },
    ],
  },
  {
    id: "marketing",
    icon: Megaphone,
    labelKey: "sidebar.marketing",
    paths: ["/campaigns", "/forms", "/lead-sources"],
    permissions: ["campaigns.view", "forms.view", "channels.view"],
    items: [
      { to: "/campaigns", icon: Megaphone, labelKey: "sidebar.campaigns", permission: "campaigns.view" },
      { to: "/lead-sources", icon: Crosshair, labelKey: "sidebar.leadSources", permission: "channels.view" },
      { to: "/forms", icon: FileText, labelKey: "sidebar.forms", permission: "forms.view" },
    ],
  },
  {
    id: "inventory",
    icon: ShoppingCart,
    labelKey: "sidebar.inventory",
    paths: ["/inventory", "/purchase-orders", "/suppliers", "/stocks", "/stock-movements", "/client-orders", "/receiving", "/stock-counts", "/warehouses"],
    // Fallback só usado se nenhum item for visível (canViewSection olha
    // primeiro para os itens) — as mesmas permissões das rotas.
    permissions: ["inventory.view", "purchase_orders.view", "suppliers.view", "client_orders.view", "receiving.view", "warehouses.view"],
    items: [
      // "Hoje" do Inventário: fila de trabalho e fluxo (rpc_inventory_today).
      { to: "/inventory", icon: Sun, labelKey: "sidebar.inventoryToday", permission: "inventory.view", counterKey: "today" },
    ],
    // Cada item tem a permissão da sua rota (App.tsx): sem isto a secção
    // aparecia a todos e o clique dava "Acesso negado".
    subSections: [
      {
        key: "inventory-purchases",
        labelKey: "sidebar.inventoryPurchases",
        defaultExpanded: true,
        items: [
          { to: "/purchase-orders", icon: ShoppingCart, labelKey: "sidebar.inventoryPurchaseOrders", permission: "purchase_orders.view", counterKey: "purchaseOrders" },
          { to: "/suppliers", icon: Truck, labelKey: "sidebar.suppliers", permission: "suppliers.view", counterKey: "suppliers" },
        ],
      },
      {
        key: "inventory-warehouse",
        labelKey: "sidebar.inventoryWarehouse",
        defaultExpanded: true,
        items: [
          { to: "/stocks", icon: BarChart3, labelKey: "sidebar.inventoryStocks", permission: "inventory.view", counterKey: "stocks" },
          { to: "/stock-movements", icon: ArrowLeftRight, labelKey: "sidebar.stockMovements", permission: "inventory.view" },
          // Permissão própria (client_orders.view): quem trabalha no armazém vê as
          // encomendas de cliente sem precisar de acesso aos contratos. Os RPCs das
          // encomendas verificam a mesma permissão.
          { to: "/client-orders", icon: ClipboardCheck, labelKey: "sidebar.inventoryClientOrders", permission: "client_orders.view", counterKey: "clientOrders" },
          // Receção por código: mesma regra da rota (permissão própria receiving.view).
          { to: "/receiving", icon: ScanBarcode, labelKey: "sidebar.inventoryReceiving", permission: "receiving.view", counterKey: "receiving" },
          // Fase 5.4: acesso ao ecrã só exige inventory.view — inventory.count/
          // inventory.edit controlam ações dentro da página, não a visibilidade do menu.
          { to: "/stock-counts", icon: ListChecks, labelKey: "sidebar.inventoryStockCounts", permission: "inventory.view", counterKey: "stockCounts" },
          { to: "/warehouses", icon: Warehouse, labelKey: "sidebar.warehouses", permission: "warehouses.view" },
        ],
      },
    ],
  },
  {
    // Recursos Humanos de exemplo (dados em memória, sem base): a gestão de toda a organização. Vem ANTES de
    // "A minha área" porque a barra lateral escolhe o primeiro grupo cujo caminho é prefixo do URL, e
    // `/rh-exemplo/documentos/modelos` e `/rh-exemplo/assiduidade-e-ausencias` começam pelos caminhos do outro grupo.
    // Mesmo desenho do ramo de RH real (`rh`), com `users.view` no lugar das permissões `hr.*`.
    id: "rh-exemplo",
    icon: IdCard,
    labelKey: "sidebar.rhExemploModulo",
    paths: [
      "/rh-exemplo/pessoas",
      "/rh-exemplo/assiduidade-e-ausencias",
      "/rh-exemplo/centros",
      "/rh-exemplo/documentos/modelos",
      "/rh-exemplo/processamento-salarial",
      "/rh-exemplo/horas-extra",
      "/rh-exemplo/admissao",
      "/rh-exemplo/contratos",
    ],
    permissions: ["users.view"],
    items: [
      { to: "/rh-exemplo/pessoas", icon: Users, labelKey: "sidebar.rhExemploPessoas", permission: "users.view" },
      { to: "/rh-exemplo/assiduidade-e-ausencias", icon: CalendarRange, labelKey: "sidebar.rhExemploAssiduidadeEAusencias", permission: "users.view" },
      { to: "/rh-exemplo/centros", icon: MapPin, labelKey: "sidebar.rhExemploCentros", permission: "users.view" },
      { to: "/rh-exemplo/documentos/modelos", icon: FileText, labelKey: "sidebar.rhExemploModelos", permission: "users.view" },
      { to: "/rh-exemplo/processamento-salarial", icon: Receipt, labelKey: "sidebar.rhExemploProcessamento", permission: "users.view" },
      { to: "/rh-exemplo/horas-extra", icon: Hourglass, labelKey: "rhFluxosC.menu.horasExtra", permission: "users.view" },
      // «Campos de admissão» e «Regras de fim de contrato» não têm entrada no menu: abrem por dois botões no cabeçalho da
      // lista de Pessoas, como no ramo de RH real. Os caminhos continuam em `paths` para o grupo se manter aberto nesses ecrãs.
    ],
  },
  {
    // A minha área de exemplo: ausências, assiduidade e documentos da PRÓPRIA pessoa (a Sofia, nos dados de exemplo).
    id: "rh-exemplo-eu",
    icon: CalendarDays,
    labelKey: "sidebar.rhExemploEu",
    paths: ["/rh-exemplo/ausencias", "/rh-exemplo/assiduidade", "/rh-exemplo/documentos", "/rh-exemplo/minhas-horas-extra"],
    permissions: ["users.view"],
    items: [
      { to: "/rh-exemplo/documentos", icon: FolderOpen, labelKey: "sidebar.rhExemploDocumentos", permission: "users.view" },
      { to: "/rh-exemplo/ausencias", icon: CalendarDays, labelKey: "sidebar.rhExemploAusencias", permission: "users.view" },
      { to: "/rh-exemplo/assiduidade", icon: Clock, labelKey: "sidebar.rhExemploAssiduidade", permission: "users.view" },
      { to: "/rh-exemplo/minhas-horas-extra", icon: Hourglass, labelKey: "rhFluxosC.menu.minhasHorasExtra", permission: "users.view" },
    ],
  },
  {
    id: "users",
    icon: UserCog,
    labelKey: "sidebar.users",
    paths: ["/users", "/roles", "/utilizadores-perfis", "/export-audit"],
    permissions: ["users.view"],
    items: [
      { to: "/users", icon: Users, labelKey: "sidebar.users", permission: "users.view" },
      { to: "/roles", icon: Shield, labelKey: "sidebar.roles", permission: "roles.view" },
      // Exemplo estático por agora (junta Utilizadores e Roles); as páginas reais continuam acima.
      { to: "/utilizadores-perfis", icon: UserCog, labelKey: "sidebar.usersProfiles", permission: "users.view" },
      { to: "/export-audit", icon: FileDown, labelKey: "sidebar.exportAudit", permission: "exports.audit.view" },
    ],
  },
  {
    id: "settings",
    icon: Settings,
    labelKey: "sidebar.settings",
    paths: ["/settings", "/smtp-management", "/email-templates", "/trash", "/send-failures"],
    permissions: [],
    items: [
      { to: "/settings", icon: Settings, labelKey: "sidebar.settings", permission: "settings.update" },
      { to: "/smtp-management", icon: Mail, labelKey: "sidebar.smtpManagement", permission: "smtp.view" },
      { to: "/email-templates", icon: Mail, labelKey: "sidebar.emailTemplates", permission: "email_templates.view" },
      { to: "/send-failures", icon: AlertTriangle, labelKey: "sidebar.sendFailures", permission: "scheduling.items.view" },
      { to: "/trash", icon: Trash2, labelKey: "sidebar.trash", permission: "settings.update" },
    ],
  },
  {
    id: "platform",
    icon: ShieldAlert,
    labelKey: "sidebar.platform",
    paths: ["/platform/support-access", "/platform/auth-audit-log", "/platform/data-erasure-requests"],
    permissions: ["platform.support_access.view", "platform.auth_audit_log.view", "rgpd.erasure.manage"],
    items: [
      { to: "/platform/support-access", icon: ShieldAlert, labelKey: "sidebar.supportAccess", permission: "platform.support_access.view" },
      { to: "/platform/auth-audit-log", icon: ShieldAlert, labelKey: "sidebar.authAuditLog", permission: "platform.auth_audit_log.view" },
      { to: "/platform/data-erasure-requests", icon: ShieldAlert, labelKey: "sidebar.dataErasureRequests", permission: "rgpd.erasure.manage" },
    ],
  },
];
