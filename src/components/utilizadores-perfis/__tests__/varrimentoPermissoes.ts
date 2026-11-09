// O varrimento do código fonte de src/ à procura das verificações de permissões, partilhado pelas guardas permissoesEmUso.test.ts e
// garantiaPermissoes.test.ts (06/11: tirado de permissoesEmUso.test.ts sem mudar nada). Fica em __tests__/ para o próprio
// varrimento o ignorar e o vitest não o correr como teste.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { CODIGOS_ESCONDIDOS, ESCONDIDAS_COM_GUARDA } from "../permissoesEmUso";

export const SRC = join(process.cwd(), "src");

/**
 * Ficheiros que não verificam permissões: testes e dados de exemplo, documentação, traduções, tipos gerados, esta própria lista,
 * e os pares de sinónimos de lib/permissionAliases.ts (mapeiam nomes, não verificam nada; employees.edit só aparece lá).
 */
export const IGNORAR = /\.test\.tsx?$|__tests__\/|\/test\/|supabaseFalso\.ts$|Exemplo\.ts$|permissoesExemplo\.ts$|catalogoExemplo\.ts$|utilizadoresPerfisFalso\.ts$|^pages\/docs\/|^translations\/|^integrations\/supabase\/types\.ts$|^lib\/permissionAliases\.ts$|^components\/utilizadores-perfis\/permissoesEmUso\.ts$/;

/**
 * Páginas LEGADAS: existem em disco mas nada vivo as importa, porque as rotas /leads, /clients e /contacts só redirecionam para /pessoas
 * (RedirectPreservandoPesquisa em App.tsx). As permissões que só elas verificam foram escondidas (03/11/2026) — por isso o scan não
 * as conta. Lista fechada e explícita: o teste «as páginas legadas não são importadas por nada vivo» falha se alguma voltar a ser
 * importada (aí sai daqui e as permissões dela voltam a estar em uso) ou se o ficheiro desaparecer (aí sai da lista).
 * ClientDetailHeader (só importado por AnewClients) não precisa de estar aqui: só verifica clients.edit, em uso. ClientDetailsDialog
 * está (06/11): também verifica deals.create, escondida.
 */
export const LEGADO = [
  "pages/AnewLeads.tsx", "pages/AnewClients.tsx", "components/leads/LeadTableRow.tsx",
  // 03/11/2026 (aprovado): as rotas antigas do catálogo redirecionam para /catalogo-custos (App.tsx); estas páginas já não montam e as
  // permissões que só elas verificavam esconderam-se (criar/eliminar serviços, marcas, categorias, subcategorias, atributos, taxas,
  // itens de catálogo, exportar/importar produtos...). Ficam as que o Catálogo novo, a receção, os fornecedores e o assistente usam.
  "pages/Products.tsx", "pages/Services.tsx", "pages/Brands.tsx", "pages/Bundles.tsx", "pages/CatalogItems.tsx",
  "pages/ProductAttributes.tsx", "pages/ProductCategories.tsx", "pages/ProductSubcategories.tsx", "pages/ServiceCatalogItems.tsx",
  "pages/ServiceCategories.tsx", "pages/ServiceFees.tsx", "pages/ServiceSubcategories.tsx",
  // 06/11/2026 (aprovado): /deals e /negocio-metas redirecionam para /negocios (App.tsx); Deals.tsx e NegocioMetas.tsx ficam em disco
  // sem rota. ClientDetailsDialog (só AnewClients o importa) entra porque verifica deals.create, agora escondida.
  "pages/Deals.tsx", "pages/NegocioMetas.tsx", "components/clients/ClientDetailsDialog.tsx",
] as const;
const NOMES_LEGADO = LEGADO.map((f) => f.split("/").pop()!.replace(/\.tsx$/, "")).join("|");
/** Um import (estático ou lazy) de uma página legada: `from "@/pages/AnewLeads"`, `import("./pages/AnewLeads")`. */
export const IMPORT_LEGADO = new RegExp(`\\b(?:from|import)\\s*\\(?\\s*["'\`][^"'\`\\n]*/(?:${NOMES_LEGADO})(?:\\.tsx)?["'\`]`);

/**
 * Páginas FORA DO MENU (03/11/2026): o grupo Aquisição saiu do menu (o Negócios em /pessoas e /negocios substitui-o), mas /quotes,
 * /proposals e /client-contracts continuam com rota, porque a ficha do /pessoas ainda as abre (ProcessoProviderReal, notificações,
 * Hoje...). /direct-sales redireciona para /negocios e DirectSales.tsx fica em disco sem rota. As permissões que só estas páginas
 * verificam foram escondidas (exportar, eliminar orçamentos, criar/editar/confirmar/faturar vendas diretas, ver custos da venda direta).
 * Ao contrário de LEGADO, estes ficheiros CONTINUAM no scan: uma permissão fora da lista em uso continua a falhar; só se tolera que
 * usem as escondidas. `paginas`: não podem voltar ao menu (teste abaixo). `soDelas`: componentes/utilitários importados só por
 * ficheiros desta lista (teste abaixo) — se outro ficheiro vivo os passar a importar, saem daqui e a permissão volta a estar em uso.
 */
export const FORA_DO_MENU = {
  paginas: [
    { ficheiro: "pages/Quotes.tsx", rota: "/quotes" },
    { ficheiro: "pages/Proposals.tsx", rota: "/proposals" },
    { ficheiro: "pages/ClientContracts.tsx", rota: "/client-contracts" },
    { ficheiro: "pages/DirectSales.tsx", rota: "/direct-sales" },
    // 06/11: /technical-settings só tem ligação do WelcomeGuide (/welcome), que nenhum ecrã abre; api_keys.copy/create/delete/toggle
    // só esta página as verificava e esconderam-se.
    { ficheiro: "pages/TechnicalSettings.tsx", rota: "/technical-settings" },
  ],
  soDelas: [
    "components/directSales/DirectSaleEditor.tsx",
    "utils/generateInternalSalePdfBlob.ts",
    "components/directSales/InternalSaleDocumentPDF.tsx",
  ],
} as const;
export const FICHEIROS_FORA_DO_MENU: readonly string[] = [...FORA_DO_MENU.paginas.map((p) => p.ficheiro), ...FORA_DO_MENU.soDelas];

/**
 * PROTÓTIPO (03/11/2026): o Inventário nativo de exemplo (src/emylia/inventario, e a cópia em pages/prototipo-negocios) trabalha numa
 * base em memória com perfis de demonstração (perfil.ts) e verifica os códigos com `exigir`/`can` contra esse perfil, nunca contra a
 * base. Pode usar códigos escondidos (purchase_orders.manage, purchase_orders.view_prices...) sem que isso os torne «em uso»: continuam
 * no scan (um código desconhecido continua a falhar), só se tolera que usem as escondidas.
 */
export const PROTOTIPO = /^(?:emylia\/inventario\/|pages\/prototipo-negocios\/)/;
export const toleraEscondidas = (ficheiro: string): boolean => FICHEIROS_FORA_DO_MENU.includes(ficheiro) || PROTOTIPO.test(ficheiro);
/** Uma escondida que uma guarda viva ainda pede, no ficheiro dessa guarda (ESCONDIDAS_COM_GUARDA). */
export const guardaEscondida = (u: { codigo: string; ficheiro: string }): boolean =>
  CODIGOS_ESCONDIDOS.has(u.codigo) && (ESCONDIDAS_COM_GUARDA[u.codigo] ?? []).includes(u.ficheiro);

/** Um literal com forma de código de permissão: "modulo.acao", "modulo.sub.acao". */
export const LITERAL = /["'`]([a-z_]+(?:\.[a-z_]+)+)["'`]/g;
/** Chaves de tradução ("t('leads.view')", "labelKey: 'x.y'") não são permissões, mesmo com o mesmo texto. */
export const TRADUCAO = /(?:\b(?:t|txt|tx|translate)\(\s*|[kK]ey\s*[:=]\s*|i18nKey=\{?)$/;
/**
 * O literal está num contexto de verificação de permissão: argumento de hasPermission/hasAnyPermission/getPermissionScope/has/can…
 * ou valor de uma propriedade/atributo permission(s) (PermissionGate, ProtectedRoute, menuConfig), também dentro de uma lista.
 */
export const CONTEXTO = /(?:\b(?:hasPermission|hasAnyPermission|hasAllPermissions|getPermissionScope|usePermissionScope|exigir|exigePerm|permissionGate|has|can|tem|perm)\s*\(|\b\w*[pP]ermissions?\w*\s*[:=]\s*\{?)[\s[(,]*(?:["'`][a-z_.]+["'`][\s,]*)*$/;

export function ficheiros(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return ficheiros(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

export interface Uso { codigo: string; ficheiro: string; contexto: boolean }

export const caminhoRelativo = (caminho: string): string => relative(SRC, caminho).split(sep).join("/");

export function usosNoCodigo(): Uso[] {
  return ficheiros(SRC).flatMap((caminho) => {
    const ficheiro = caminhoRelativo(caminho);
    if (IGNORAR.test(ficheiro) || (LEGADO as readonly string[]).includes(ficheiro)) return [];
    const texto = readFileSync(caminho, "utf8");
    return [...texto.matchAll(LITERAL)].flatMap((m): Uso[] => {
      const antes = texto.slice(Math.max(0, (m.index ?? 0) - 400), m.index ?? 0);
      if (TRADUCAO.test(antes)) return [];
      return [{ codigo: m[1] ?? "", ficheiro, contexto: CONTEXTO.test(antes) }];
    });
  });
}
