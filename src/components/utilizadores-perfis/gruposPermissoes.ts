// O agrupamento das permissões como no ecrã de Roles atual (src/pages/Roles.tsx): categorias com o seu rótulo, grupos que
// espelham o menu lateral (com subgrupos) e o distintivo de ação (Ver, Criar, Editar, Eliminar...) tirado do fim do código.
import type { Permissao } from "./tipos";

/** Os rótulos das categorias, copiados de `categoryLabels` de Roles.tsx. */
export const ROTULOS_CATEGORIA: Record<string, string> = {
  dashboard: "Dashboard", organizations: "Organizações", org_chart: "Organograma", flow_builder: "Flow Builder",
  products: "Produtos", bundles: "Bundles", brands: "Marcas", product_categories: "Categorias de Produto",
  product_subcategories: "Subcategorias de Produto", product_attributes: "Atributos de Produto", units_of_measure: "Unidades de Medida",
  services: "Serviços", service_categories: "Categorias de Serviço", service_subcategories: "Subcategorias de Serviço",
  service_fees: "Taxas de Serviço", leads: "Leads", contacts: "Contactos", clients: "Clientes", deals: "Pedidos de Proposta",
  proposals: "Propostas", quotes: "Orçamentos", quote_templates: "Templates de Orçamento", direct_sales: "Vendas Diretas",
  contracts: "Contratos", client_contracts: "Contratos de Cliente", campaigns: "Campanhas", forms: "Formulários", lead_sources: "Origens",
  suppliers: "Fornecedores", warehouses: "Armazéns", purchase_orders: "Encomendas", receiving: "Receção no armazém", stocks: "Stocks",
  inventory: "Acesso a Stock", client_orders: "Encomendas Clientes", scheduling: "Agendamentos", users: "Utilizadores", roles: "Funções",
  settings: "Definições", smtp: "SMTP", email_templates: "Templates de Email", hr: "Recursos Humanos",
  // Categorias que Roles.tsx não mostrava.
  operations: "Operação", catalog_items: "Itens de Catálogo", service_catalog: "Catálogo de Serviços",
  pessoas: "Pessoas", negocios: "Etapas do Negócio", fleet: "Frota", security: "Auditoria de Exportações",
  api_keys: "API Keys", technical_settings: "Configurações Técnicas", trash: "Lixo", portal: "Portal de Clientes",
  platform: "Plataforma",
};

interface DefinicaoGrupo {
  rotulo: string;
  categorias: string[];
  subgrupos?: { rotulo: string; categorias: string[] }[];
}

/**
 * Os grupos do editor, pela ordem do menu lateral (menuConfig.ts): Dashboard, Atividades, Operação, Catálogo e custos, Organizações,
 * Negócios (com os dados da pessoa: leads.*, clients.* e contacts.*), Documentos do negócio, Marketing, Inventário, Frota, RH, Utilizadores,
 * Definições e Plataforma. Partiu de `sidebarMenuGroups` de Roles.tsx; diferenças: `forms` só no subgrupo Formulários (lá contavam a
 * dobrar), Produtos/Serviços passam para Catálogo e custos (o item de topo que os substitui), e ganham grupo as categorias que Roles.tsx
 * escondia (hr, pessoas/negocios, fleet, operations, portal, security, platform, api_keys, catalog_items, service_catalog, lead_sources).
 * Só aparecem as permissões em uso (permissoesEmUso.ts); grupos e subgrupos sem nenhuma omitem-se.
 */
export const GRUPOS_MENU: DefinicaoGrupo[] = [
  { rotulo: "Dashboard", categorias: ["dashboard"] },
  {
    rotulo: "Agendamentos", categorias: [],
    subgrupos: [
      { rotulo: "Quadros", categorias: ["scheduling_boards"] },
      { rotulo: "Itens", categorias: ["scheduling_items"] },
      { rotulo: "Recursos", categorias: ["scheduling_resources"] },
      { rotulo: "Regras de Auto-agendamento", categorias: ["scheduling_rules"] },
      { rotulo: "Outros", categorias: ["scheduling_other"] },
    ],
  },
  { rotulo: "Operação", categorias: ["operations"] },
  {
    rotulo: "Catálogo e custos", categorias: [],
    subgrupos: [
      { rotulo: "Produtos", categorias: ["products", "catalog_items", "bundles", "brands", "product_categories", "product_subcategories", "product_attributes", "units_of_measure"] },
      { rotulo: "Serviços", categorias: ["services", "service_catalog", "service_categories", "service_subcategories", "service_fees"] },
    ],
  },
  { rotulo: "Organizações", categorias: ["organizations", "org_chart", "flow_builder"] },
  // /pessoas e /negocios: um subgrupo por fase do negócio, pela ordem das 6 fases do ecrã (Por contactar, Contacto, Visita, Negócio,
  // Financeiro, Obra), pelas categorias virtuais de categoriaNegocio() (pessoas.*, negocios.*, e quotes.view_costs / client_contracts.cancel,
  // que saem dos Documentos do negócio). «Pessoas: leads e clientes» junta os dados da pessoa (leads.*, clients.* e, 03/11, contacts.*: o grupo CRM
  // deixou de existir); «Por contactar» tira de lá ver, criar e atribuir leads. Uma permissão com outro prefixo guardada nas categorias
  // leads/contacts/clients também vai para «Pessoas» (categoriaNegocio), para não desaparecer do editor.
  {
    rotulo: "Negócios", categorias: [],
    subgrupos: [
      { rotulo: "Geral", categorias: ["negocios_geral"] },
      { rotulo: "Pessoas: leads e clientes", categorias: ["negocios_pessoas"] },
      { rotulo: "Por contactar", categorias: ["negocios_por_contactar"] },
      { rotulo: "Contacto", categorias: ["negocios_contacto"] },
      { rotulo: "Visita", categorias: ["negocios_visita"] },
      { rotulo: "Negócio", categorias: ["negocios_negocio"] },
      { rotulo: "Financeiro", categorias: ["negocios_financeiro"] },
      { rotulo: "Obra", categorias: ["negocios_obra"] },
    ],
  },
  // 03/11: era «Aquisição». O grupo saiu do menu (o Negócios substitui-o), mas os documentos (pedidos de proposta, orçamentos,
  // propostas, contratos) continuam: a ficha do /pessoas abre-os e /quotes, /proposals e /client-contracts têm rota. «Configuração»
  // junta o que controla os templates e modelos (agora no grupo Definições do menu): quote_templates.* (/quote-models),
  // proposals.manage (templates e workflow das propostas, /proposal-templates), client_contracts.manage_templates e
  // client_contracts.manage (as duas abrem a policy client_templates_manage de client_contract_templates, /contract-templates).
  // quotes.manage NÃO vai para lá: além de /quote-templates é a permissão de ver custos e margens no orçamento (canViewQuoteCosts,
  // QuoteBuilder) e das ações em massa (rpc_bulk_status_quote), por isso fica com os orçamentos.
  {
    rotulo: "Documentos do negócio", categorias: [],
    subgrupos: [
      { rotulo: "Pedidos de Proposta", categorias: ["deals"] },
      { rotulo: "Propostas e orçamentos", categorias: ["proposals", "quotes"] },
      { rotulo: "Venda Direta", categorias: ["direct_sales"] },
      { rotulo: "Contratos", categorias: ["contracts", "client_contracts", "portal"] },
      { rotulo: "Configuração", categorias: ["quote_templates", "documentos_config"] },
    ],
  },
  {
    rotulo: "Marketing", categorias: [],
    subgrupos: [
      { rotulo: "Campanhas", categorias: ["marketing_campaigns"] },
      { rotulo: "Origens", categorias: ["marketing_channels", "lead_sources"] },
      { rotulo: "Listas", categorias: ["marketing_lists"] },
      { rotulo: "Formulários", categorias: ["forms"] },
    ],
  },
  { rotulo: "Inventário", categorias: ["suppliers", "warehouses", "purchase_orders", "receiving", "stocks", "inventory", "client_orders"] },
  { rotulo: "Frota", categorias: ["fleet"] },
  // Roles.tsx aceita a categoria hr no filtro mas não a põe em nenhum grupo, e as permissões hr.* não se viam. Aqui ganham grupo.
  // 03/11: partido em subgrupos pelo prefixo do código (categoriaRh); um hr.* não mapeado cai em «Pessoas: ficha».
  {
    rotulo: "Recursos Humanos", categorias: [],
    subgrupos: [
      { rotulo: "Pessoas: ficha", categorias: ["hr_pessoas"] },
      { rotulo: "Dados sensíveis", categorias: ["hr_sensiveis"] },
      { rotulo: "Admissão", categorias: ["hr_admissao"] },
      { rotulo: "Documentos", categorias: ["hr_documentos"] },
      { rotulo: "Contratos, cargos e ofícios", categorias: ["hr_contratos"] },
      { rotulo: "Retribuição e custos", categorias: ["hr_retribuicao"] },
      { rotulo: "Horário e assiduidade", categorias: ["hr_horario"] },
      { rotulo: "Ausências", categorias: ["hr_ausencias"] },
      { rotulo: "Processamento salarial", categorias: ["hr_processamento"] },
      { rotulo: "Centros de trabalho", categorias: ["hr_locais"] },
      { rotulo: "Denúncias", categorias: ["hr_denuncias"] },
    ],
  },
  // security = exports.audit.view (/export-audit vive no menu de Utilizadores).
  { rotulo: "Utilizadores", categorias: ["users", "roles", "security"] },
  // api_keys: ecrã de configurações técnicas (/technical-settings). trash e technical_settings estão hoje escondidas (nada as verifica).
  { rotulo: "Definições", categorias: ["settings", "smtp", "email_templates", "api_keys", "technical_settings", "trash"] },
  { rotulo: "Plataforma", categorias: ["platform"] },
];

/**
 * Códigos guardados numa categoria da base mas com bloco próprio no editor, pelo prefixo: a base junta marcas/categorias/atributos em
 * `products` e as taxas/subcategorias em `services`. (Os negocios.*, guardados em `pessoas`, vão por categoriaNegocio().)
 */
const PREFIXOS_COM_BLOCO = new Set([
  "brands", "bundles", "product_categories", "product_subcategories", "product_attributes", "units_of_measure",
  "service_categories", "service_subcategories", "service_fees", "service_catalog", "catalog_items", "lead_sources",
]);

const ROTULOS_VIRTUAIS: Record<string, string> = {
  marketing_campaigns: "Campanhas", marketing_channels: "Origens", marketing_lists: "Listas",
  scheduling_boards: "Quadros", scheduling_items: "Itens", scheduling_resources: "Recursos", scheduling_rules: "Regras", scheduling_other: "Outros",
  negocios_geral: "Geral", negocios_pessoas: "Pessoas: leads e clientes", negocios_por_contactar: "Por contactar", negocios_contacto: "Contacto",
  negocios_visita: "Visita", negocios_negocio: "Negócio", negocios_financeiro: "Financeiro", negocios_obra: "Obra",
  documentos_config: "Templates de propostas e contratos",
  hr_pessoas: "Pessoas: ficha", hr_sensiveis: "Dados sensíveis", hr_admissao: "Admissão", hr_documentos: "Documentos",
  hr_contratos: "Contratos, cargos e ofícios", hr_retribuicao: "Retribuição e custos", hr_horario: "Horário e assiduidade",
  hr_ausencias: "Ausências", hr_processamento: "Processamento salarial", hr_locais: "Centros de trabalho", hr_denuncias: "Denúncias",
};

/** Os subgrupos do RH pelo início do código, pela ordem em que se testam (o mais específico primeiro). */
const PREFIXOS_RH: readonly (readonly [string, string])[] = [
  ["hr.pessoas.saude.", "hr_sensiveis"], ["hr.pessoas.sindicalizacao.", "hr_sensiveis"],
  ["hr.pessoas.convite.", "hr_admissao"], ["hr.onboarding.", "hr_admissao"], ["hr.admissao.", "hr_admissao"],
  ["hr.pessoas.documentos.", "hr_documentos"],
  ["hr.pessoas.vinculos.", "hr_contratos"], ["hr.contratos.", "hr_contratos"], ["hr.cargos.", "hr_contratos"], ["hr.pessoas.laborais.", "hr_contratos"],
  ["hr.pessoas.retribuicao.", "hr_retribuicao"],
  ["hr.assiduidade.", "hr_horario"], ["hr.pessoas.horario.", "hr_horario"], ["hr.pessoas.horario_realizado.", "hr_horario"],
  ["hr.ausencias.", "hr_ausencias"],
  ["hr.processamento.", "hr_processamento"], ["hr.vencimento.", "hr_processamento"],
  ["hr.locais.", "hr_locais"],
  ["hr.denuncias.", "hr_denuncias"],
];

/** O subgrupo do RH da permissão (hr.* ou categoria hr), ou null se não for do RH. O que não estiver mapeado fica na ficha. */
function categoriaRh(p: Permissao): string | null {
  if (!p.codigo.startsWith("hr.") && p.categoria !== "hr") return null;
  return PREFIXOS_RH.find(([prefixo]) => p.codigo.startsWith(prefixo))?.[1] ?? "hr_pessoas";
}

/** Os negocios.* pela segunda parte do código (a fase); o que não for conhecido (e negocios.perder) cai em Geral. 03/11: o orçamento, a
 *  margem, a proposta (incluindo a decisão do cliente) e o contrato são a fase Negócio. */
const FASES_NEGOCIO = new Map<string, string>([
  ["contacto", "negocios_contacto"],
  ["visita", "negocios_visita"],
  ["orcamento", "negocios_negocio"], ["margem", "negocios_negocio"], ["proposta", "negocios_negocio"], ["contrato", "negocios_negocio"],
  ["registar_fatura", "negocios_financeiro"], ["validar_pagamento", "negocios_financeiro"],
  ["obra", "negocios_obra"],
  ["perder", "negocios_geral"],
]);

/** Permissões doutros módulos que, no editor, pertencem a uma fase do negócio (saem dos Documentos do negócio; ver, criar e atribuir leads, das Pessoas). */
const MOVIDAS_PARA_NEGOCIOS = new Map<string, string>([
  ["quotes.view_costs", "negocios_negocio"],
  ["client_contracts.cancel", "negocios_negocio"],
  ["leads.view", "negocios_por_contactar"], ["leads.create", "negocios_por_contactar"], ["leads.assign", "negocios_por_contactar"],
]);

/** Os dados da pessoa (lead/cliente/contacto da entidade única): ficam em Negócios › Pessoas, pelo prefixo do código. */
const PREFIXOS_PESSOA = new Set(["leads", "clients", "contacts"]);

/** A categoria virtual de Negócios da permissão, ou null se não for de Negócios. */
function categoriaNegocio(p: Permissao): string | null {
  const movida = MOVIDAS_PARA_NEGOCIOS.get(p.codigo);
  if (movida) return movida;
  const [prefixo, fase] = p.codigo.split(".");
  if (prefixo === "negocios") return FASES_NEGOCIO.get(fase ?? "") ?? "negocios_geral";
  if (prefixo === "pessoas") return "negocios_geral";
  if (PREFIXOS_PESSOA.has(prefixo ?? "") || PREFIXOS_PESSOA.has(p.categoria)) return "negocios_pessoas";
  // Outra permissão guardada nas categorias de Negócios fica em Geral (não desaparece do editor).
  if (p.categoria === "pessoas" || p.categoria === "negocios") return "negocios_geral";
  return null;
}

export interface BlocoCategoria {
  categoria: string;
  rotulo: string;
  permissoes: Permissao[];
}

export interface SubgrupoMenu {
  rotulo: string;
  blocos: BlocoCategoria[];
  permissoes: Permissao[];
}

export interface GrupoMenu {
  rotulo: string;
  /** As categorias do próprio grupo (fora dos subgrupos). */
  blocos: BlocoCategoria[];
  subgrupos: SubgrupoMenu[];
  /** Todas as permissões do grupo, diretas e dos subgrupos. */
  permissoes: Permissao[];
}

/**
 * Permissões que a base guarda numa categoria mas que, no editor, vivem no bloco doutra pelo código. platform.pending_submissions.view
 * (submissões pendentes dos formulários, /leads/pending-submissions) está em `leads` na base mas é de Marketing › Formulários.
 */
const MOVIDAS_POR_CODIGO = new Map<string, string>([
  ["platform.pending_submissions.view", "forms"],
  // Documentos do negócio › Configuração (ver GRUPOS_MENU).
  ["proposals.manage", "documentos_config"],
  ["client_contracts.manage_templates", "documentos_config"],
  ["client_contracts.manage", "documentos_config"],
]);

/**
 * Agendamentos e Marketing partem-se em categorias virtuais pelo prefixo do código, como em Roles.tsx; Negócios parte-se por fase
 * (categoriaNegocio) e o RH por área (categoriaRh).
 */
export function categoriaVirtual(p: Permissao): string {
  const movida = MOVIDAS_POR_CODIGO.get(p.codigo);
  if (movida) return movida;
  if (p.categoria === "scheduling") {
    if (p.codigo.startsWith("scheduling.boards")) return "scheduling_boards";
    if (p.codigo.startsWith("scheduling.items")) return "scheduling_items";
    if (p.codigo.startsWith("scheduling.resources")) return "scheduling_resources";
    if (p.codigo.startsWith("scheduling.rules")) return "scheduling_rules";
    return "scheduling_other";
  }
  if (p.categoria === "marketing") {
    if (p.codigo.startsWith("campaigns.")) return "marketing_campaigns";
    if (p.codigo.startsWith("channels.")) return "marketing_channels";
    if (p.codigo.startsWith("lists.")) return "marketing_lists";
  }
  const negocio = categoriaNegocio(p);
  if (negocio) return negocio;
  const rh = categoriaRh(p);
  if (rh) return rh;
  const prefixo = p.codigo.split(".")[0] ?? "";
  if (PREFIXOS_COM_BLOCO.has(prefixo)) return prefixo;
  return p.categoria;
}

const rotuloDe = (categoria: string): string => ROTULOS_VIRTUAIS[categoria] ?? ROTULOS_CATEGORIA[categoria] ?? categoria;

/** As permissões que não cabem em nenhum grupo do menu (o ecrã de Roles também as esconde). */
export function permissoesForaDoMenu(permissoes: Permissao[]): Permissao[] {
  const conhecidas = new Set(GRUPOS_MENU.flatMap((g) => [...g.categorias, ...(g.subgrupos ?? []).flatMap((s) => s.categorias)]));
  return permissoes.filter((p) => !conhecidas.has(categoriaVirtual(p)));
}

function blocosDe(categorias: string[], porCategoria: Map<string, Permissao[]>): BlocoCategoria[] {
  return categorias.flatMap((categoria) => {
    const permissoes = porCategoria.get(categoria) ?? [];
    return permissoes.length > 0 ? [{ categoria, rotulo: rotuloDe(categoria), permissoes }] : [];
  });
}

const juntar = (blocos: BlocoCategoria[]): Permissao[] => blocos.flatMap((b) => b.permissoes);

/** Agrupa as permissões como o ecrã de Roles: um grupo por entrada do menu; grupos e subgrupos sem permissões não aparecem. */
export function agruparPorMenu(permissoes: Permissao[]): GrupoMenu[] {
  const porCategoria = new Map<string, Permissao[]>();
  permissoes.forEach((p) => {
    const c = categoriaVirtual(p);
    porCategoria.set(c, [...(porCategoria.get(c) ?? []), p]);
  });
  return GRUPOS_MENU.flatMap((def) => {
    const blocos = blocosDe(def.categorias, porCategoria);
    const subgrupos = (def.subgrupos ?? []).flatMap((s) => {
      const blocosSub = blocosDe(s.categorias, porCategoria);
      return blocosSub.length > 0 ? [{ rotulo: s.rotulo, blocos: blocosSub, permissoes: juntar(blocosSub) }] : [];
    });
    const todas = [...juntar(blocos), ...subgrupos.flatMap((s) => s.permissoes)];
    return todas.length > 0 ? [{ rotulo: def.rotulo, blocos, subgrupos, permissoes: todas }] : [];
  });
}

export interface DistintivoAcao {
  rotulo: string;
  classes: string;
}

const AZUL = "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
const VERDE = "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
const AMBAR = "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
const VERMELHO = "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
const ROXO = "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
const TEAL = "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300";

/** `getActionBadge` de Roles.tsx: o rótulo e as cores saem do fim do código; um fim desconhecido fica em texto simples. */
const DISTINTIVOS: Record<string, DistintivoAcao> = {
  view: { rotulo: "Ver", classes: AZUL },
  create: { rotulo: "Criar", classes: VERDE },
  edit: { rotulo: "Editar", classes: AMBAR },
  update: { rotulo: "Editar", classes: AMBAR },
  delete: { rotulo: "Eliminar", classes: VERMELHO },
  manage_roles: { rotulo: "Gerir Roles", classes: ROXO },
  manage_permissions: { rotulo: "Gerir Permissões", classes: ROXO },
  export: { rotulo: "Exportar", classes: TEAL },
  import: { rotulo: "Importar", classes: TEAL },
  receive: { rotulo: "Receber", classes: VERDE },
  manage_delivery_notes: { rotulo: "Guias", classes: AMBAR },
  learn_codes: { rotulo: "Códigos", classes: ROXO },
  download_proof: { rotulo: "PDF", classes: TEAL },
  // Negócios (pessoas.* e negocios.*): os códigos acabam em português.
  editar: { rotulo: "Editar", classes: AMBAR },
  aprovar: { rotulo: "Aprovar", classes: ROXO },
  enviar: { rotulo: "Enviar", classes: TEAL },
  planear: { rotulo: "Planear", classes: AMBAR },
  executar: { rotulo: "Executar", classes: VERDE },
  materiais: { rotulo: "Materiais", classes: TEAL },
  registar_fatura: { rotulo: "Fatura", classes: TEAL },
  validar_pagamento: { rotulo: "Pagamento", classes: ROXO },
  // 03/11 (20270105200000): as seis por fase.
  registar: { rotulo: "Registar", classes: VERDE },
  gerir: { rotulo: "Gerir", classes: AMBAR },
  decidir: { rotulo: "Decidir", classes: ROXO },
  imprevistos: { rotulo: "Imprevistos", classes: AMBAR },
  fechar: { rotulo: "Encerrar", classes: ROXO },
  perder: { rotulo: "Perder", classes: VERMELHO },
  reopen: { rotulo: "Reabrir", classes: AMBAR },
  config: { rotulo: "Configurar", classes: ROXO },
};

export function distintivoAcao(codigo: string): DistintivoAcao {
  const fim = codigo.split(".").pop() ?? "";
  return DISTINTIVOS[fim] ?? { rotulo: fim.charAt(0).toUpperCase() + fim.slice(1).replace(/_/g, " "), classes: "" };
}
