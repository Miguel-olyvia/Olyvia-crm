// As listas de escolha dos formulários do Inventário (produtos, armazéns, fornecedores). Sem React.
import type { Inventario } from "./tipos";

export type Opcao = readonly [string, string];

/** Os produtos por escolher: "SKU — nome". Sem `kits`, os pacotes ficam de fora (não têm stock próprio). */
export const opcoesProdutos = (db: Inventario, kits = true): Opcao[] => db.products.filter((p) => !p.deleted && (kits || !p.kit)).map((p) => [p.sku, `${p.sku} — ${p.name}`] as const);
/** Os armazéns ativos; com `todos`, também os inativos (marcados) e nunca os eliminados. */
export const opcoesArmazens = (db: Inventario, todos = false): Opcao[] => db.warehouses.filter((w) => !w.deleted && (todos || w.active)).map((w) => [w.id, w.name + (w.active ? "" : " (inativo)")] as const);
/** Os armazéns que servem clientes (os de expedição). */
export const opcoesExpedicao = (db: Inventario): Opcao[] => db.warehouses.filter((w) => !w.deleted && w.active && w.serves).map((w) => [w.id, w.name] as const);
export const opcoesFornecedores = (db: Inventario): Opcao[] => db.suppliers.filter((s) => !s.deleted).map((s) => [s.id, s.name] as const);
/** Só os produtos que o fornecedor vende (os artigos ligados). */
export const opcoesArtigosDe = (db: Inventario, sup: string): Opcao[] =>
  db.items.filter((i) => i.sup === sup).map((i) => [i.sku, `${i.sku} — ${db.products.find((p) => p.sku === i.sku)?.name ?? i.sku} (${i.unitLabel})`] as const);
