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
  ListChecks,
  IdCard,
  CalendarDays,
  Clock,
  FolderOpen,
  CalendarRange,
  MapPin,
} from "lucide-react";

export interface MenuItem {
  to: string;
  icon: LucideIcon;
  labelKey: string;
  permission?: string;
  permissions?: string[];
}

export interface MenuSubSection {
  key: string;
  labelKey: string;
  items: MenuItem[];
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
    permissions: ["scheduling.items.view"],
    adminOnly: true,
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
    paths: ["/leads", "/leads/pending-submissions", "/clients"],
    permissions: ["leads.view", "clients.view"],
    items: [
      { to: "/leads", icon: Target, labelKey: "sidebar.leads", permission: "leads.view" },
      { to: "/leads/pending-submissions", icon: FileText, labelKey: "sidebar.pendingSubmissions", permission: "platform.pending_submissions.view" },
      { to: "/clients", icon: Building, labelKey: "sidebar.clients", permission: "clients.view" },
    ],
  },
  {
    // A minha area -- ausencias e assiduidade da PROPRIA pessoa. Publico:
    // qualquer colaborador com ficha, nao so quem trabalha em RH. Separada da
    // seccao de Recursos Humanos por pedido explicito: quem so quer marcar
    // ferias ou ver o proprio ponto nao deve ter de abrir o menu do RH para
    // isso -- sao AUDIENCIAS diferentes, nao papeis exclusivos.
    id: "rh-eu",
    icon: CalendarDays,
    labelKey: "sidebar.myArea",
    paths: ["/rh/ausencias", "/rh/assiduidade", "/rh/documentos"],
    permissions: ["hr.ausencias.view.own", "hr.assiduidade.view.own", "hr.pessoas.documentos.view.own"],
    items: [
      { to: "/rh/ausencias", icon: CalendarDays, labelKey: "sidebar.hrAusencias", permission: "hr.ausencias.view.own" },
      { to: "/rh/assiduidade", icon: Clock, labelKey: "sidebar.hrAssiduidade", permission: "hr.assiduidade.view.own" },
      { to: "/rh/documentos", icon: FolderOpen, labelKey: "sidebar.hrDocumentos", permission: "hr.pessoas.documentos.view.own" },
    ],
  },
  {
    // Recursos Humanos -- modulo 1 (Colaboradores) mais a gestao de
    // ausencias/assiduidade de toda a organizacao. Sem `adminOnly`: a
    // permissao `hr.pessoas.view` ja esconde o item de quem nao a tem, e
    // nenhum papel a recebe por omissao (a migration do catalogo nao faz
    // atribuicao nenhuma). Os sub-separadores do ecra (Atividade, Equipas,
    // Organograma, Funcoes) vivem dentro da pagina e nao no menu.
    //
    // Ausencias (Aprovacoes + Organizacao) e Mapa de assiduidade fundiram-se
    // agora num so item de menu de nivel superior, que leva a
    // AssiduidadeEAusencias.tsx (separador de DOMINIO por cima dos
    // separadores internos que cada um ja tinha, nao tocados). Continua
    // aqui, e nao em "A minha area", pela mesma razao de sempre: quem
    // controla o acesso e a PERMISSAO, nao a seccao -- a seccao e so
    // organizacao visual.
    // As tres rotas antigas (`/rh/ausencias/aprovacoes`,
    // `/rh/ausencias/organizacao`, `/rh/assiduidade/organizacao`) ficam em
    // `paths` (mesmo sem item de menu proprio) para o grupo continuar
    // realcado para quem aterra num desses redirects antigos.
    id: "rh",
    icon: IdCard,
    labelKey: "sidebar.hrModule",
    paths: ["/rh/pessoas", "/rh/ausencias/aprovacoes", "/rh/ausencias/organizacao", "/rh/assiduidade/organizacao", "/rh/assiduidade-e-ausencias", "/rh/centros", "/rh/admissao/configuracao", "/rh/documentos/modelos", "/rh/vencimento/configuracao"],
    permissions: ["hr.module.access", "hr.pessoas.view", "hr.ausencias.view", "hr.assiduidade.view", "hr.ausencias.aprovar.chefia", "hr.ausencias.aprovar.rh", "hr.locais.view", "hr.admissao.obrigatorios.gerir", "hr.pessoas.documentos.modelos.view", "hr.vencimento.codigos.view", "hr.vencimento.subsidio.view"],
    items: [
      { to: "/rh/pessoas", icon: Users, labelKey: "sidebar.hr", permission: "hr.pessoas.view" },
      { to: "/rh/assiduidade-e-ausencias", icon: CalendarRange, labelKey: "sidebar.hrAssiduidadeEAusencias", permissions: ["hr.ausencias.view", "hr.ausencias.aprovar.chefia", "hr.ausencias.aprovar.rh", "hr.assiduidade.view"] },
      // Gestao de centros de trabalho (20261130165000): listar, criar,
      // editar e desactivar hr_locais_trabalho. `hr.locais.view` ja existe
      // desde 20261120120000 e ja esta atribuida ao super_admin
      // (20261120180000) -- nenhuma permissao nova para este ecra.
      { to: "/rh/centros", icon: MapPin, labelKey: "sidebar.hrCentros", permission: "hr.locais.view" },
      // "Campos de admissao" (20261201050000) deixou de ter item proprio
      // aqui -- passou a um botao dentro do ecra de Pessoas (Pessoas.tsx),
      // atras da mesma permissao. A rota `/rh/admissao/configuracao`
      // continua a existir e protegida (App.tsx); so o link na barra lateral
      // saiu. Fica em `paths`/`permissions` acima para o grupo RH continuar
      // realcado para quem aterra la.
      // Modelos de documento (contrato/adenda/declaracao/recibo/outro) usados
      // para emitir a um pessoa (20261123020000). Permissao ja existe, so
      // atribuida a super_admin -- ver hrDb/useModelosDocumentosRH.
      { to: "/rh/documentos/modelos", icon: FileText, labelKey: "sidebar.hrModelosDocumentos", permission: "hr.pessoas.documentos.modelos.view" },
      // Configuracao do dominio "Vencimento" (20261201180000..20261201200000):
      // deixa de estar escondida como botao dentro de Pessoas.tsx e passa a
      // item proprio, tal como Modelos de documentos acima. Qualquer uma das
      // duas permissoes de leitura do dominio ja chega -- o ecra decide os
      // separadores que mostra a cada uma (ver App.tsx, mesma rota).
      { to: "/rh/vencimento/configuracao", icon: Settings, labelKey: "sidebar.hrVencimentoConfig", permissions: ["hr.vencimento.codigos.view", "hr.vencimento.subsidio.view"] },
    ],
  },
  {
    id: "acquisition",
    icon: Target,
    labelKey: "sidebar.acquisition",
    paths: ["/deals", "/proposals", "/quotes", "/quote-models", "/quote-templates", "/modelos-orcamento", "/proposal-templates", "/client-contracts", "/contract-templates", "/acquisition-help", "/needs-assessment-config"],
    permissions: ["deals.view", "proposals.view", "quotes.view"],
    items: [
      { to: "/deals", icon: Handshake, labelKey: "sidebar.proposalRequests", permission: "deals.view" },
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
    paths: ["/suppliers", "/warehouses", "/purchase-orders", "/stocks"],
    permissions: ["suppliers.view"],
    items: [
      { to: "/suppliers", icon: Truck, labelKey: "sidebar.suppliers", permission: "suppliers.view" },
      { to: "/warehouses", icon: Warehouse, labelKey: "sidebar.warehouses" },
      { to: "/purchase-orders", icon: ShoppingCart, labelKey: "sidebar.purchaseOrders" },
      { to: "/stocks", icon: BarChart3, labelKey: "sidebar.stocks" },
    ],
  },
  {
    id: "users",
    icon: UserCog,
    labelKey: "sidebar.users",
    paths: ["/users", "/roles", "/export-audit"],
    permissions: ["users.view"],
    items: [
      { to: "/users", icon: Users, labelKey: "sidebar.users", permission: "users.view" },
      { to: "/roles", icon: Shield, labelKey: "sidebar.roles", permission: "roles.view" },
      { to: "/export-audit", icon: FileDown, labelKey: "sidebar.exportAudit", permission: "exports.audit.view" },
    ],
  },
  {
    id: "settings",
    icon: Settings,
    labelKey: "sidebar.settings",
    paths: ["/settings", "/smtp-management", "/email-templates", "/trash"],
    permissions: [],
    items: [
      { to: "/settings", icon: Settings, labelKey: "sidebar.settings", permission: "settings.update" },
      { to: "/smtp-management", icon: Mail, labelKey: "sidebar.smtpManagement", permission: "smtp.view" },
      { to: "/email-templates", icon: Mail, labelKey: "sidebar.emailTemplates", permission: "email_templates.view" },
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

export const bottomItem: TopLevelItem = {
  id: "home",
  to: "/home",
  icon: LayoutDashboard,
  labelKey: "sidebar.panel",
  permissions: [],
};
