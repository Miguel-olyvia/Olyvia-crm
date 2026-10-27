// Reconhecer o produto que se escreve num campo de linha (parseProd do mockup): sem React.
import type { LinhaEd } from "./linhasEd";
import type { Inventario } from "./tipos";

export type Opcao = readonly [string, string];

/** parseProd() do mockup: o SKU (ou o EAN) antes do " — "; só vale se estiver entre as opções. */
export function reconhecerProduto(texto: string, opcoes: readonly Opcao[], eans: Record<string, string>): string {
  const t = texto.trim();
  if (!t) return "";
  const tok = t.split(" — ")[0].trim(), lc = tok.toLowerCase();
  const o = opcoes.find(([v]) => v.toLowerCase() === lc) ?? opcoes.find(([v]) => eans[v] === tok);
  return o ? o[0] : "";
}
/** A primeira linha com texto que não se reconheceu como produto (o erro "Produto não reconhecido" do mockup). */
export const naoReconhecida = (linhas: readonly LinhaEd[]): string | undefined => linhas.find((l) => !l.sku && (l.p ?? "").trim())?.p?.trim();

/** Os EAN por SKU (para reconhecer um código de barras escrito no campo do produto). */
export const eansDe = (db: Inventario): Record<string, string> => Object.fromEntries(db.products.map((p) => [p.sku, p.ean]));
