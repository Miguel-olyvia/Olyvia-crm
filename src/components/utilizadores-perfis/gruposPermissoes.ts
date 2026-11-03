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
 * CRM (Negócios e as páginas antigas de leads/contactos/clientes), Aquisição, Marketing, Inventário, Frota, RH, Utilizadores,
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
  // /pessoas e /negocios: um subgrupo por fase do negócio, pelas categorias virtuais de categoriaNegocio() (pessoas.*, negocios.*,
  // e quotes.view_costs / client_contracts.cancel, que saem de Aquisição).
  {
    rotulo: "Negócios", categorias: [],
    subgrupos: [
      { rotulo: "Geral", categorias: ["negocios_geral"] },
      { rotulo: "Visita", categorias: ["negocios_visita"] },
      { rotulo: "Orçamento e proposta", categorias: ["negocios_orcamento"] },
      { rotulo: "Contrato", categorias: ["negocios_contrato"] },
      { rotulo: "Financeiro", categorias: ["negocios_financeiro"] },
      { rotulo: "Obra", categorias: ["negocios_obra"] },
    ],
  },
  { rotulo: "CRM", categorias: ["leads", "contacts", "clients"] },
  {
    rotulo: "Aquisição", categorias: ["deals"],
    subgrupos: [
      { rotulo: "Propostas", categorias: ["proposals", "quotes", "quote_templates"] },
      { rotulo: "Venda Direta", categorias: ["direct_sales"] },
      { rotulo: "Contratos", categorias: ["contracts", "client_contracts", "portal"] },
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
  { rotulo: "Recursos Humanos", categorias: ["hr"] },
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
  negocios_geral: "Geral", negocios_visita: "Visita", negocios_orcamento: "Orçamento e proposta", negocios_contrato: "Contrato",
  negocios_financeiro: "Financeiro", negocios_obra: "Obra",
};

/** Os negocios.* pela segunda parte do código (a fase); o que não for conhecido cai em Geral. */
const FASES_NEGOCIO = new Map<string, string>([
  ["visita", "negocios_visita"],
  ["orcamento", "negocios_orcamento"], ["margem", "negocios_orcamento"], ["proposta", "negocios_orcamento"],
  ["contrato", "negocios_contrato"],
  ["registar_fatura", "negocios_financeiro"], ["validar_pagamento", "negocios_financeiro"],
  ["obra", "negocios_obra"],
]);

/** Permissões doutros módulos que, no editor, pertencem a uma fase do negócio (saem de Aquisição). */
const MOVIDAS_PARA_NEGOCIOS = new Map<string, string>([
  ["quotes.view_costs", "negocios_orcamento"],
  ["client_contracts.cancel", "negocios_contrato"],
]);

/** A categoria virtual de Negócios da permissão, ou null se não for de Negócios. */
function categoriaNegocio(p: Permissao): string | null {
  const movida = MOVIDAS_PARA_NEGOCIOS.get(p.codigo);
  if (movida) return movida;
  const [prefixo, fase] = p.codigo.split(".");
  if (prefixo === "negocios") return FASES_NEGOCIO.get(fase ?? "") ?? "negocios_geral";
  if (prefixo === "pessoas") return "negocios_geral";
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
 * Agendamentos e Marketing partem-se em categorias virtuais pelo prefixo do código, como em Roles.tsx; Negócios parte-se por fase
 * (categoriaNegocio).
 */
export function categoriaVirtual(p: Permissao): string {
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
  reopen: { rotulo: "Reabrir", classes: AMBAR },
  config: { rotulo: "Configurar", classes: ROXO },
};

export function distintivoAcao(codigo: string): DistintivoAcao {
  const fim = codigo.split(".").pop() ?? "";
  return DISTINTIVOS[fim] ?? { rotulo: fim.charAt(0).toUpperCase() + fim.slice(1).replace(/_/g, " "), classes: "" };
}
