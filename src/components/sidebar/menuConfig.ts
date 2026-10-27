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
  Target,
  FileCheck,
  BookOpen,
  Package,
  Wrench,
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
  Coins,
  KeyRound,
  Fuel,
  FileBadge,
  TriangleAlert,
  Waypoints,
  CarFront,
  History as HistoryIcon,
  Eye,
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
  /** Só aparece nas organizações com o interruptor dos negócios ligado (useNegociosAtivos); falha fechada. */
  requiresNegociosAtivos?: boolean;
  /**
   * Contador opcional (pílula no painel do menu), alimentado por
   * useInventoryToday. Zero ou null = sem pílula. Não mexe no alerta do rail.
   */
  counterKey?: InventoryCounterKey;
  /** Contador da Frota (pílula no painel do menu), lido da BD com as chaves dos ecrãs da Frota (useContadoresFrota). */
  frotaCounterKey?: "hoje" | "viaturas" | "ocorrencias" | "manutencao";
  /** Só o caminho exato realça a entrada (um ecrã filho com outra entrada, ou sem entrada, não a realça). */
  exact?: boolean;
  /** Contador de texto (p.ex. «1 por aprovar»), alimentado por uma memória de exemplo e não pelo Inventário. */
  textCounter?: "rhDenunciasPorConfirmar";
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
    paths: ["/organizations", "/org-templates", "/org-chart", "/org-help", "/flow-builder", "/brands", "/bundles", "/products", "/product-categories", "/product-subcategories", "/product-attributes", "/units-of-measure", "/services", "/service-catalog", "/service-categories", "/service-subcategories", "/service-fees", "/catalogo-custos"],
    permissions: ["organizations.view", "products.view", "services.view"],
    items: [
      { to: "/organizations", icon: Building, labelKey: "sidebar.organizations", permission: "organizations.view" },
      { to: "/org-chart", icon: Network, labelKey: "sidebar.orgChart", permission: "organizations.view" },
      { to: "/flow-builder", icon: Zap, labelKey: "sidebar.flowBuilder", permission: "flow_builder.view" },
      { to: "/org-help", icon: HelpCircle, labelKey: "sidebar.help", permission: "organizations.view" },
    ],
    subSections: [
      // Emylia (decisão de 27/10): o Catálogo e custos substitui os Produtos e os Serviços no menu.
      // As páginas antigas (/products, /services, categorias, marcas, pacotes…) continuam pelo endereço até à limpeza.
      {
        key: "catalogo",
        labelKey: "sidebar.catalogoCustos",
        items: [
          { to: "/catalogo-custos", icon: Package, labelKey: "sidebar.catalogoCustos", permission: "services.view" },
        ],
      },
    ],
  },
  {
    id: "crm",
    icon: UsersRound,
    labelKey: "sidebar.crm",
    paths: ["/pessoas", "/pipeline", "/negocios", "/leads/pending-submissions"],
    permissions: ["pessoas.view", "platform.pending_submissions.view"],
    items: [
      { to: "/pessoas", icon: UsersRound, labelKey: "sidebar.people", permission: "pessoas.view", requiresNegociosAtivos: true },
      // Emylia (decisão 11, 27/10): os Negócios da Emylia desde a lead; o Pipeline do RH continua em /pipeline, pelo endereço
      { to: "/negocios", icon: Target, labelKey: "sidebar.negociosEmylia", permission: "pessoas.view", requiresNegociosAtivos: true },
      { to: "/leads/pending-submissions", icon: FileText, labelKey: "sidebar.pendingSubmissions", permission: "platform.pending_submissions.view" },
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
    paths: ["/rh/pessoas", "/rh/ausencias/aprovacoes", "/rh/ausencias/organizacao", "/rh/assiduidade/organizacao", "/rh/assiduidade-e-ausencias", "/rh/centros", "/rh/admissao/configuracao", "/rh/documentos/modelos", "/rh/processamento-salarial"],
    permissions: ["hr.module.access", "hr.pessoas.view", "hr.ausencias.view", "hr.assiduidade.view", "hr.ausencias.aprovar.chefia", "hr.ausencias.aprovar.rh", "hr.locais.view", "hr.pessoas.laborais.view", "hr.admissao.obrigatorios.gerir", "hr.pessoas.documentos.modelos.view", "hr.vencimento.codigos.view", "hr.vencimento.subsidio.view"],
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
      // "Processamento Salarial" (nome de apresentacao; dominio interno
      // continua "vencimento" -- permissoes hr.vencimento.*, tabelas e hooks
      // nao mudam de nome, 20261201180000..20261201200000) e o dominio, nao
      // so a configuracao -- passou a apontar para o ecra principal
      // `/rh/processamento-salarial` (Vencimento.tsx, rota renomeada em
      // 20260917), que tem "Configuracao" como um dos separadores.
      // Qualquer uma das duas permissoes de leitura do dominio ja chega -- o
      // ecra decide os separadores internos que mostra a cada uma (ver
      // App.tsx, mesma rota). A chave de traducao `sidebar.hrVencimentoConfig`
      // fica com o nome antigo por decisao deliberada -- corresponde ao
      // dominio interno "vencimento" que a base e as permissoes usam; so o
      // VALOR mostrado muda para "Processamento Salarial".
      { to: "/rh/processamento-salarial", icon: Settings, labelKey: "sidebar.hrVencimentoConfig", permissions: ["hr.vencimento.codigos.view", "hr.vencimento.subsidio.view"] },
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
    // Frota (tabelas fleet_*, RLS + RPCs), a seguir ao Inventário: as carrinhas são armazéns móveis. Abre com fleet.view
    // (gestão) ou fleet.self (o condutor vê a sua viatura), as mesmas das rotas /frota/* em App.tsx. O Hoje é /frota/hoje
    // (e /frota redireciona para lá): com "/frota" como item, a regra de item ativo do menu (pathname === to ||
    // startsWith(to + "/")) marcava o Hoje em todas as páginas da Frota. O grupo é escolhido pelo prefixo "/frota".
    id: "frota",
    // CarFront, para não repetir o Truck dos Fornecedores (Inventário › Compras).
    icon: CarFront,
    labelKey: "sidebar.frota",
    paths: ["/frota"],
    permissions: ["fleet.view", "fleet.self"],
    items: [
      { to: "/frota/hoje", icon: Sun, labelKey: "sidebar.frotaHoje", permissions: ["fleet.view", "fleet.self"], frotaCounterKey: "hoje" },
      { to: "/frota/viaturas", icon: Truck, labelKey: "sidebar.frotaViaturas", permissions: ["fleet.view", "fleet.self"], frotaCounterKey: "viaturas" },
      { to: "/frota/atribuicoes", icon: KeyRound, labelKey: "sidebar.frotaAtribuicoes", permissions: ["fleet.view", "fleet.self"] },
      { to: "/frota/condutores", icon: IdCard, labelKey: "sidebar.frotaCondutores", permissions: ["fleet.view", "fleet.self"] },
      { to: "/frota/manutencao", icon: Wrench, labelKey: "sidebar.frotaManutencao", permissions: ["fleet.view", "fleet.self"], frotaCounterKey: "manutencao" },
      { to: "/frota/custos", icon: Fuel, labelKey: "sidebar.frotaCustos", permissions: ["fleet.view", "fleet.self"] },
      { to: "/frota/ocorrencias", icon: TriangleAlert, labelKey: "sidebar.frotaOcorrencias", permissions: ["fleet.view", "fleet.self"], frotaCounterKey: "ocorrencias" },
      { to: "/frota/documentos", icon: FileBadge, labelKey: "sidebar.frotaDocumentos", permissions: ["fleet.view", "fleet.self"] },
      { to: "/frota/relatorios", icon: BarChart3, labelKey: "sidebar.frotaRelatorios", permissions: ["fleet.view", "fleet.self"] },
      { to: "/frota/atividade", icon: HistoryIcon, labelKey: "sidebar.frotaAtividade", permissions: ["fleet.view", "fleet.self"] },
      { to: "/frota/ligacoes", icon: Waypoints, labelKey: "sidebar.frotaLigacoes", permissions: ["fleet.view", "fleet.self"] },
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
      "/rh-exemplo/organizacao",
      "/rh-exemplo/documentos/modelos",
      "/rh-exemplo/processamento-salarial",
      "/rh-exemplo/custos",
      "/rh-exemplo/admissao",
      "/rh-exemplo/contratos",
      "/rh-exemplo/denuncias",
    ],
    permissions: ["users.view"],
    items: [
      { to: "/rh-exemplo/pessoas", icon: Users, labelKey: "sidebar.rhExemploPessoas", permission: "users.view" },
      { to: "/rh-exemplo/organizacao", icon: Network, labelKey: "sidebar.rhExemploOrganizacao", permission: "users.view" },
      { to: "/rh-exemplo/assiduidade-e-ausencias", icon: CalendarRange, labelKey: "sidebar.rhExemploAssiduidadeEAusencias", permission: "users.view" },
      { to: "/rh-exemplo/centros", icon: MapPin, labelKey: "sidebar.rhExemploCentros", permission: "users.view" },
      { to: "/rh-exemplo/documentos/modelos", icon: FileText, labelKey: "sidebar.rhExemploModelos", permission: "users.view" },
      { to: "/rh-exemplo/processamento-salarial", icon: Receipt, labelKey: "sidebar.rhExemploProcessamento", permission: "users.view" },
      { to: "/rh-exemplo/custos", icon: Coins, labelKey: "rhCustos.menu", permission: "users.view" },
      // A gestão do canal de denúncias da organização ativa (anónimas e identificadas), com o contador «N por confirmar».
      { to: "/rh-exemplo/denuncias", icon: ShieldAlert, labelKey: "sidebar.rhExemploDenuncias", permission: "users.view", textCounter: "rhDenunciasPorConfirmar" },
      // Índice dos oito estados da página pública do convite; `exact` para não realçar em `/admissao/configuracao`.
      { to: "/rh-exemplo/admissao", icon: Eye, labelKey: "sidebar.rhExemploVerComoPessoa", permission: "users.view", exact: true },
      // «Campos de admissão» e «Regras de fim de contrato» não têm entrada no menu: abrem por dois botões no cabeçalho da
      // lista de Pessoas, como no ramo de RH real. Os caminhos continuam em `paths` para o grupo se manter aberto nesses ecrãs.
    ],
  },
  {
    // A minha área de exemplo: ausências, assiduidade e documentos da PRÓPRIA pessoa (a Sofia, nos dados de exemplo).
    id: "rh-exemplo-eu",
    icon: CalendarDays,
    labelKey: "sidebar.rhExemploEu",
    paths: ["/rh-exemplo/ausencias", "/rh-exemplo/assiduidade", "/rh-exemplo/documentos", "/rh-exemplo/minhas-denuncias"],
    permissions: ["users.view"],
    items: [
      { to: "/rh-exemplo/documentos", icon: FolderOpen, labelKey: "sidebar.rhExemploDocumentos", permission: "users.view" },
      { to: "/rh-exemplo/ausencias", icon: CalendarDays, labelKey: "sidebar.rhExemploAusencias", permission: "users.view" },
      { to: "/rh-exemplo/assiduidade", icon: Clock, labelKey: "sidebar.rhExemploAssiduidade", permission: "users.view" },
      // Canal de denúncias, do lado de quem denuncia: UMA entrada (denunciar num painel e acompanhar nas abas).
      { to: "/rh-exemplo/minhas-denuncias", icon: Megaphone, labelKey: "sidebar.rhExemploMinhasDenuncias", permission: "users.view" },
    ],
  },
  {
    id: "users",
    icon: UserCog,
    labelKey: "sidebar.users",
    paths: ["/users", "/roles", "/utilizadores-perfis", "/export-audit"],
    permissions: ["users.view", "roles.view"],
    items: [
      // Um só ecrã com Utilizadores e Roles em separadores; cada separador pede a sua permissão (users.view, roles.view).
      // /users e /roles continuam a existir como redireccionamento para o separador certo.
      { to: "/utilizadores-perfis", icon: UserCog, labelKey: "sidebar.usersProfiles", permissions: ["users.view", "roles.view"] },
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
