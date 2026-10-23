// As linhas "produto + quantidade" dos formulários: o tipo que o editor usa e a validação das que se preenchem.
export interface LinhaEd { sku: string; qty: number | ""; cost?: number | ""; /** O texto escrito no campo do produto (o mockup deixa escrever e reconhece depois). */ p?: string }

/** As linhas escolhidas (sem as vazias) com a quantidade já como número; devolve `null` se alguma tiver produto sem quantidade inteira. */
export function linhasValidas(linhas: LinhaEd[]): { sku: string; qty: number; cost?: number | null }[] | null {
  const out: { sku: string; qty: number; cost?: number | null }[] = [];
  for (const l of linhas) {
    if (!l.sku) continue;
    if (l.qty === "" || !Number.isInteger(l.qty) || l.qty < 1) return null;
    out.push({ sku: l.sku, qty: l.qty, cost: l.cost === "" || l.cost === undefined ? null : l.cost });
  }
  return out;
}
