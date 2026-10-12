// A escolha de produto por texto do mockup (prodOptsHtml, parseProd e money): um campo com <datalist> "SKU — nome", que também aceita o SKU ou o EAN escritos ou lidos.
import { eur } from "./base";
import { can } from "./perfil";
import type { Inventario } from "./tipos";

/** O texto que a lista oferece para um produto: "SKU — nome". */
export const textoProduto = (db: Inventario, sku: string): string => `${sku} — ${db.products.find((p) => p.sku === sku)?.name ?? sku}`;

/** O SKU de um texto escrito (parseProd do mockup): aceita "SKU — nome", o SKU ou o EAN; `null` se não reconhece. */
export function analisarProduto(db: Inventario, v: string): string | null {
  const t = String(v || "").trim();
  if (!t) return null;
  const sku = t.split(" — ")[0].trim();
  const lc = sku.toLowerCase();
  return db.products.find((p) => p.sku.toLowerCase() === lc || p.ean === sku)?.sku ?? null;
}

/** A lista `dl-prod` com todos os produtos por eliminar (a que os campos de produto usam). */
export function ListaProdutos({ db }: { db: Inventario }) {
  return <datalist id="dl-prod">{db.products.filter((p) => !p.deleted).map((p) => <option key={p.sku} value={`${p.sku} — ${p.name}`}>EAN {p.ean}</option>)}</datalist>;
}

/** Um valor de compra: sem a permissão de ver preços de compra, um traço (money() do mockup). */
export const dinheiro = (n: number): React.ReactNode => (can("purchase_orders.view_prices") ? eur(n) : <span className="muted" title="Sem permissão para ver preços de compra">—</span>);
