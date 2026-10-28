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
};

interface DefinicaoGrupo {
  rotulo: string;
  categorias: string[];
  subgrupos?: { rotulo: string; categorias: string[] }[];
}

/**
 * `sidebarMenuGroups` de Roles.tsx. Diferença: lá o grupo Marketing lista `forms` nas categorias diretas E no subgrupo
 * Formulários (as permissões apareciam duas vezes e contavam a dobrar); aqui só ficam no subgrupo.
 */
export const GRUPOS_MENU: DefinicaoGrupo[] = [
  { rotulo: "Dashboard", categorias: ["dashboard"] },
  {
    rotulo: "Organizações", categorias: ["organizations", "org_chart", "flow_builder"],
    subgrupos: [
      { rotulo: "Produtos", categorias: ["products", "bundles", "brands", "product_categories", "product_subcategories", "product_attributes", "units_of_measure"] },
      { rotulo: "Serviços", categorias: ["services", "service_categories", "service_subcategories", "service_fees"] },
    ],
  },
  { rotulo: "CRM", categorias: ["leads", "contacts", "clients"] },
  {
    rotulo: "Aquisição", categorias: ["deals"],
    subgrupos: [
      { rotulo: "Propostas", categorias: ["proposals", "quotes", "quote_templates"] },
      { rotulo: "Venda Direta", categorias: ["direct_sales"] },
      { rotulo: "Contratos", categorias: ["contracts", "client_contracts"] },
    ],
  },
  {
    rotulo: "Marketing", categorias: [],
    subgrupos: [
      { rotulo: "Campanhas", categorias: ["marketing_campaigns"] },
      { rotulo: "Origens", categorias: ["marketing_channels"] },
      { rotulo: "Listas", categorias: ["marketing_lists"] },
      { rotulo: "Formulários", categorias: ["forms"] },
    ],
  },
  { rotulo: "Inventário", categorias: ["suppliers", "warehouses", "purchase_orders", "receiving", "stocks", "inventory", "client_orders"] },
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
  { rotulo: "Utilizadores", categorias: ["users", "roles"] },
  { rotulo: "Definições", categorias: ["settings", "smtp", "email_templates"] },
  // Roles.tsx aceita a categoria hr no filtro mas não a põe em nenhum grupo, e as permissões hr.* não se viam. Aqui ganham grupo.
  { rotulo: "Recursos Humanos", categorias: ["hr"] },
];

const ROTULOS_VIRTUAIS: Record<string, string> = {
  marketing_campaigns: "Campanhas", marketing_channels: "Origens", marketing_lists: "Listas",
  scheduling_boards: "Quadros", scheduling_items: "Itens", scheduling_resources: "Recursos", scheduling_rules: "Regras", scheduling_other: "Outros",
};

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

/** Agendamentos e Marketing partem-se em categorias virtuais pelo prefixo do código, como em Roles.tsx. */
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
};

export function distintivoAcao(codigo: string): DistintivoAcao {
  const fim = codigo.split(".").pop() ?? "";
  return DISTINTIVOS[fim] ?? { rotulo: fim.charAt(0).toUpperCase() + fim.slice(1).replace(/_/g, " "), classes: "" };
}
