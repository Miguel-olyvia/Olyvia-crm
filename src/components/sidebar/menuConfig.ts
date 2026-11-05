import { LucideIcon } from "lucide-react";
import {
  Building,
  Zap,
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
  /** Exige TODAS as `permissions` em vez de qualquer uma (OR, por omissão). */
  requireAll?: boolean;
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

/**
 * As permissões de cada entrada do RH, as mesmas das rotas /rh-exemplo/* em App.tsx (qualquer uma chega). Exportadas para a rota
 * e o menu não divergirem.
 */
export const PERMISSOES_RH = {
  // A rota aceita também hr.pessoas.view.own (a própria ficha, useContextoFicha); o menu, que abre a lista, só hr.pessoas.view.
  pessoas: ["hr.pessoas.view"],
  organizacao: ["hr.pessoas.colocacao.view"],
  assiduidadeEAusencias: [
    "hr.ausencias.view", "hr.ausencias.aprovar.chefia", "hr.ausencias.aprovar.rh", "hr.assiduidade.view", "hr.assiduidade.equipa.view",
  ],
  centros: ["hr.locais.view"],
  modelos: ["hr.pessoas.documentos.modelos.view"],
  processamento: ["hr.processamento.periodo.view", "hr.vencimento.codigos.view", "hr.vencimento.subsidio.view"],
  custos: ["hr.pessoas.retribuicao.view"],
  denuncias: ["hr.denuncias.gerir"],
  // A regra de podeVerAdmissoes (PessoasRh).
  admissao: ["hr.pessoas.convite.enviar", "hr.onboarding.approve"],
};

/** As permissões das entradas de «Eu» (a própria pessoa; a permissão geral também chega). */
export const PERMISSOES_RH_EU = {
  documentos: ["hr.pessoas.documentos.view.own", "hr.pessoas.documentos.view"],
  ausencias: ["hr.ausencias.view.own", "hr.ausencias.pedir"],
  assiduidade: ["hr.assiduidade.view.own", "hr.assiduidade.picar"],
};

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
    // Emylia (decisão de 27/10): as Operações vivem no CRM e a operacao-app deixa de se usar. Abre as Obras do /negocios.
    id: "operacao",
    to: "/negocios?vista=operacoes",
    icon: Wrench,
    labelKey: "sidebar.operations",
    // 03/11: a rota /negocios (RotaNegocios) exige pessoas.view (ou um papel no Negócio pelo RH, que já abre o /negocios pelo Hoje);
    // o item pede as duas, para não aparecer a quem tem operations.view e depois leva «Sem acesso».
    permissions: ["operations.view", "pessoas.view"],
    requireAll: true,
  },
  {
    // Emylia (decisão de 27/10): o Catálogo e custos substitui os Produtos e os Serviços. 28/10: sai de Organizações para o topo, como no
    // protótipo. 03/11: as páginas antigas (/products, /services, categorias, marcas, pacotes…) redirecionam para aqui.
    id: "catalogo",
    to: "/catalogo-custos",
    icon: Package,
    labelKey: "sidebar.catalogoCustos",
    permissions: ["services.view"],
  },
];

export const menuSections: MenuSection[] = [
  {
    id: "organizations",
    icon: Building,
    labelKey: "sidebar.organizations",
    // 03/11: as páginas antigas do catálogo (/products, /services, marcas, categorias...) redirecionam para /catalogo-custos (item de topo).
    paths: ["/organizations", "/org-templates", "/org-chart", "/org-help", "/flow-builder"],
    permissions: ["organizations.view", "flow_builder.view"],
    items: [
      { to: "/organizations", icon: Building, labelKey: "sidebar.organizations", permission: "organizations.view" },
      { to: "/org-chart", icon: Network, labelKey: "sidebar.orgChart", permission: "organizations.view" },
      { to: "/flow-builder", icon: Zap, labelKey: "sidebar.flowBuilder", permission: "flow_builder.view" },
      { to: "/org-help", icon: HelpCircle, labelKey: "sidebar.help", permission: "organizations.view" },
    ],
  },
  {
    id: "crm",
    icon: UsersRound,
    labelKey: "sidebar.crm",
    paths: ["/pessoas", "/negocios", "/leads/pending-submissions"],
    permissions: ["pessoas.view", "platform.pending_submissions.view"],
    items: [
      { to: "/pessoas", icon: UsersRound, labelKey: "sidebar.people", permission: "pessoas.view", requiresNegociosAtivos: true },
      // Emylia (decisão 11, 27/10): os Negócios da Emylia desde a lead. 28/10 (noite, Rúben): o Pipeline sai do menu; /pipeline fica pelo endereço
      { to: "/negocios", icon: Target, labelKey: "sidebar.negociosEmylia", permission: "pessoas.view", requiresNegociosAtivos: true },
      { to: "/leads/pending-submissions", icon: FileText, labelKey: "sidebar.pendingSubmissions", permission: "platform.pending_submissions.view" },
    ],
  },
  {
    id: "marketing",
    icon: Megaphone,
    labelKey: "sidebar.marketing",
    paths: ["/campaigns", "/forms", "/lead-sources"],
    permissions: ["campaigns.view", "forms.view", "lead_sources.view"],
    items: [
      { to: "/campaigns", icon: Megaphone, labelKey: "sidebar.campaigns", permission: "campaigns.view" },
      // 03/11: a permissão da própria página (era channels.view); a rota pede a mesma.
      { to: "/lead-sources", icon: Crosshair, labelKey: "sidebar.leadSources", permission: "lead_sources.view" },
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
    // Recursos Humanos: a gestão de toda a organização. Vem ANTES de "Eu" porque a barra lateral escolhe o primeiro grupo cujo
    // caminho é prefixo do URL, e `/rh-exemplo/documentos/modelos` e `/rh-exemplo/assiduidade-e-ausencias` começam pelos caminhos
    // do outro grupo. 03/11: cada item pede as permissões hr.* da sua rota (App.tsx) e o grupo aparece com qualquer delas
    // (era `users.view` em tudo, e um colaborador normal não via nada).
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
    permissions: [...new Set(Object.values(PERMISSOES_RH).flat())],
    items: [
      { to: "/rh-exemplo/pessoas", icon: Users, labelKey: "sidebar.rhExemploPessoas", permissions: PERMISSOES_RH.pessoas },
      { to: "/rh-exemplo/organizacao", icon: Network, labelKey: "sidebar.rhExemploOrganizacao", permissions: PERMISSOES_RH.organizacao },
      { to: "/rh-exemplo/assiduidade-e-ausencias", icon: CalendarRange, labelKey: "sidebar.rhExemploAssiduidadeEAusencias", permissions: PERMISSOES_RH.assiduidadeEAusencias },
      { to: "/rh-exemplo/centros", icon: MapPin, labelKey: "sidebar.rhExemploCentros", permissions: PERMISSOES_RH.centros },
      { to: "/rh-exemplo/documentos/modelos", icon: FileText, labelKey: "sidebar.rhExemploModelos", permissions: PERMISSOES_RH.modelos },
      { to: "/rh-exemplo/processamento-salarial", icon: Receipt, labelKey: "sidebar.rhExemploProcessamento", permissions: PERMISSOES_RH.processamento },
      { to: "/rh-exemplo/custos", icon: Coins, labelKey: "rhCustos.menu", permissions: PERMISSOES_RH.custos },
      // A gestão do canal de denúncias da organização ativa (anónimas e identificadas), com o contador «N por confirmar».
      { to: "/rh-exemplo/denuncias", icon: ShieldAlert, labelKey: "sidebar.rhExemploDenuncias", permissions: PERMISSOES_RH.denuncias, textCounter: "rhDenunciasPorConfirmar" },
      // Índice dos oito estados da página pública do convite; `exact` para não realçar em `/admissao/configuracao`.
      { to: "/rh-exemplo/admissao", icon: Eye, labelKey: "sidebar.rhExemploVerComoPessoa", permissions: PERMISSOES_RH.admissao, exact: true },
      // «Campos de admissão» e «Regras de fim de contrato» não têm entrada no menu: abrem por dois botões no cabeçalho da
      // lista de Pessoas, como no ramo de RH real. Os caminhos continuam em `paths` para o grupo se manter aberto nesses ecrãs.
    ],
  },
  {
    // «Eu»: ausências, assiduidade, documentos e denúncias da PRÓPRIA pessoa. Sem permissão de grupo (como Definições): aparece a
    // quem puder ver pelo menos um item, e «As minhas denúncias» basta a sessão (RhSemFichaDenuncias trata quem não tem ficha).
    id: "rh-exemplo-eu",
    icon: CalendarDays,
    labelKey: "sidebar.rhExemploEu",
    paths: ["/rh-exemplo/ausencias", "/rh-exemplo/assiduidade", "/rh-exemplo/documentos", "/rh-exemplo/minhas-denuncias"],
    permissions: [],
    items: [
      { to: "/rh-exemplo/documentos", icon: FolderOpen, labelKey: "sidebar.rhExemploDocumentos", permissions: PERMISSOES_RH_EU.documentos },
      { to: "/rh-exemplo/ausencias", icon: CalendarDays, labelKey: "sidebar.rhExemploAusencias", permissions: PERMISSOES_RH_EU.ausencias },
      { to: "/rh-exemplo/assiduidade", icon: Clock, labelKey: "sidebar.rhExemploAssiduidade", permissions: PERMISSOES_RH_EU.assiduidade },
      // Canal de denúncias, do lado de quem denuncia: UMA entrada (denunciar num painel e acompanhar nas abas). Sem permissão.
      { to: "/rh-exemplo/minhas-denuncias", icon: Megaphone, labelKey: "sidebar.rhExemploMinhasDenuncias" },
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
      // /users continua a existir como rota da página antiga, sem item no menu; /roles redirecciona para /utilizadores-perfis?aba=roles.
      { to: "/utilizadores-perfis", icon: UserCog, labelKey: "sidebar.usersProfiles", permissions: ["users.view", "roles.view"] },
      { to: "/export-audit", icon: FileDown, labelKey: "sidebar.exportAudit", permission: "exports.audit.view" },
    ],
  },
  {
    id: "settings",
    icon: Settings,
    labelKey: "sidebar.settings",
    // 03/11: os templates e modelos dos documentos do negócio vêm do grupo Aquisição (que saiu do menu: o Negócios em /pessoas e
    // /negocios substitui-o). Cada item tem a permissão da sua rota em App.tsx (03/11: /proposal-templates passou a pedir proposals.manage,
    // /send-failures smtp.view e /trash trash.view).
    paths: [
      "/settings", "/smtp-management", "/email-templates", "/trash", "/send-failures",
      "/contract-templates", "/quote-templates", "/proposal-templates", "/quote-models", "/modelos-orcamento",
    ],
    permissions: [],
    items: [
      { to: "/settings", icon: Settings, labelKey: "sidebar.settings", permission: "settings.update" },
      { to: "/smtp-management", icon: Mail, labelKey: "sidebar.smtpManagement", permission: "smtp.view" },
      { to: "/email-templates", icon: Mail, labelKey: "sidebar.emailTemplates", permission: "email_templates.view" },
      { to: "/contract-templates", icon: BookOpen, labelKey: "sidebar.contractTemplates", permissions: ["client_contracts.view", "client_contracts.manage_templates"] },
      { to: "/quote-templates", icon: FileCheck, labelKey: "today.quick.quotePdfTemplates", permission: "quotes.manage" },
      { to: "/proposal-templates", icon: FileText, labelKey: "sidebar.proposalTemplates", permission: "proposals.manage" },
      { to: "/quote-models", icon: FileCheck, labelKey: "today.quick.quoteModels", permission: "quote_templates.view" },
      { to: "/send-failures", icon: AlertTriangle, labelKey: "sidebar.sendFailures", permission: "smtp.view" },
      { to: "/trash", icon: Trash2, labelKey: "sidebar.trash", permission: "trash.view" },
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
