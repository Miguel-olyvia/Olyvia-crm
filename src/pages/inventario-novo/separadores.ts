// Os 9 separadores do novo Inventário (/inventory/novo/:aba). Cada um embebe o ecrã clássico TAL COMO ESTÁ (o mesmo lazy
// import de App.tsx, o mesmo chunk) e tem a mesma permissão da rota clássica (ProtectedRoute em App.tsx) e o mesmo
// contador do menu (counterKey de menuConfig.ts → useInventoryCounters).
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { InventoryCounterKey } from "@/hooks/useInventoryToday";
import { INVENTORY_PATHS } from "@/components/inventory/ui/inventoryLinks";

export const CHAVES_SEPARADOR = [
  "hoje",
  "encomendas",
  "fornecedores",
  "rececao",
  "existencias",
  "movimentos",
  "contagens",
  "armazens",
  "saidas",
] as const;
export type ChaveSeparador = (typeof CHAVES_SEPARADOR)[number];

export interface Separador {
  chave: ChaveSeparador;
  rotulo: string;
  /** A rota clássica que o separador substitui (INVENTORY_PATHS). */
  path: string;
  /** A permissão da rota clássica em App.tsx (ProtectedRoute permission=…). */
  permissao: string;
  /** O contador do menu (menuConfig.ts); sem ele, o separador não tem pílula. */
  counterKey?: InventoryCounterKey;
  Componente: LazyExoticComponent<ComponentType>;
}

export const SEPARADORES: readonly Separador[] = [
  { chave: "hoje", rotulo: "Hoje", path: INVENTORY_PATHS.today, permissao: "inventory.view", counterKey: "today",
    Componente: lazy(() => import("@/pages/InventoryToday")) },
  { chave: "encomendas", rotulo: "Encomendas", path: INVENTORY_PATHS.purchaseOrders, permissao: "purchase_orders.view", counterKey: "purchaseOrders",
    Componente: lazy(() => import("@/pages/PurchaseOrders")) },
  { chave: "fornecedores", rotulo: "Fornecedores", path: INVENTORY_PATHS.suppliers, permissao: "suppliers.view", counterKey: "suppliers",
    Componente: lazy(() => import("@/pages/Suppliers")) },
  { chave: "rececao", rotulo: "Receção", path: INVENTORY_PATHS.receiving, permissao: "receiving.view", counterKey: "receiving",
    Componente: lazy(() => import("@/pages/Receiving")) },
  { chave: "existencias", rotulo: "Existências", path: INVENTORY_PATHS.stocks, permissao: "inventory.view", counterKey: "stocks",
    Componente: lazy(() => import("@/pages/Stocks")) },
  { chave: "movimentos", rotulo: "Movimentos", path: INVENTORY_PATHS.stockMovements, permissao: "inventory.view",
    Componente: lazy(() => import("@/pages/StockMovements")) },
  { chave: "contagens", rotulo: "Contagens", path: INVENTORY_PATHS.stockCounts, permissao: "inventory.view", counterKey: "stockCounts",
    Componente: lazy(() => import("@/pages/StockCounts")) },
  { chave: "armazens", rotulo: "Armazéns", path: INVENTORY_PATHS.warehouses, permissao: "warehouses.view",
    Componente: lazy(() => import("@/pages/Warehouses")) },
  { chave: "saidas", rotulo: "Saídas para clientes", path: INVENTORY_PATHS.clientOrders, permissao: "client_orders.view", counterKey: "clientOrders",
    Componente: lazy(() => import("@/pages/ClientOrders")) },
];

export const eChaveSeparador = (x: string | null | undefined): x is ChaveSeparador =>
  !!x && (CHAVES_SEPARADOR as readonly string[]).includes(x);

export const separadorDe = (chave: ChaveSeparador): Separador => SEPARADORES.find((s) => s.chave === chave) as Separador;

/** Os separadores que o utilizador pode abrir (a mesma regra de ProtectedRoute: hasPermission(permission)). */
export const separadoresVisiveis = (hasPermission: (p: string) => boolean): Separador[] =>
  SEPARADORES.filter((s) => hasPermission(s.permissao));

/** A permissão OR do item Inventário no menu (menuConfig.ts, secção inventory) — a da rota /inventory/novo. */
export const PERMISSOES_INVENTARIO = [
  "inventory.view",
  "purchase_orders.view",
  "suppliers.view",
  "client_orders.view",
  "receiving.view",
  "warehouses.view",
];

/**
 * O interruptor do novo Inventário. Ligado (por omissão): as 9 rotas clássicas redirecionam para o separador
 * (App.tsx, RedirecionarParaSeparador), o menu aponta para os separadores, o Hoje clássico não mostra «Experimentar o
 * novo Inventário» e a moldura tem «Voltar» (página anterior ou /) em vez de «Voltar ao clássico».
 * Para voltar ao clássico sem tocar no código: VITE_INVENTARIO_CLASSICO=1 no build.
 */
export const INVENTARIO_NOVO_ATIVO: boolean = import.meta.env.VITE_INVENTARIO_CLASSICO !== "1";

export const BASE_NOVO = "/inventory/novo";
export const caminhoSeparador = (chave: ChaveSeparador): string => `${BASE_NOVO}/${chave}`;
