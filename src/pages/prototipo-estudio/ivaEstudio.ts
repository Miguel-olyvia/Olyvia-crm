// 18/11 (Rúben: «IVA por linha, 6% para serviços»). O IVA do Estúdio, linha a linha, como na proposta do negócio (motor.ts, IVA_MO e
// IVA_MAT): os trabalhos (a mão de obra, os serviços) a 6% e as peças e os materiais a 23%. A soma sem IVA, o IVA de cada taxa e o total.
// Ainda sem a regra dos 20% dos materiais (verba 2.27) nem a empreitada toda a 6% numa ARU (verba 2.23).

/** A taxa dos trabalhos (a mão de obra) e a das peças e dos materiais. As mesmas do negócio (motor.ts, IVA_MO e IVA_MAT). */
export const IVA_TRABALHOS = 0.06, IVA_PECAS = 0.23;

export interface ParteIva { taxa: number; base: number; iva: number }
export interface TotaisIva { semIva: number; iva: number; comIva: number; taxas: ParteIva[] }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A taxa de uma linha pelo grupo: os trabalhos (ou a montagem) a 6%, o resto a 23%. */
export const taxaDoGrupo = (grupo: string): number => (grupo === "Trabalhos" || grupo === "Montagem" ? IVA_TRABALHOS : IVA_PECAS);

/** Os totais com o IVA por taxa: cada taxa com a sua base e o seu IVA (só as que têm valor, a mais baixa primeiro). */
export function totaisPorTaxa(linhas: readonly { total: number; taxa: number }[]): TotaisIva {
  const bases = new Map<number, number>();
  for (const l of linhas) bases.set(l.taxa, (bases.get(l.taxa) ?? 0) + l.total);
  const taxas = [...bases.entries()]
    .map(([taxa, base]) => ({ taxa, base: r2(base), iva: r2(base * taxa) }))
    .filter((x) => x.base !== 0)
    .sort((a, b) => a.taxa - b.taxa);
  const semIva = r2(taxas.reduce((s, x) => s + x.base, 0));
  const iva = r2(taxas.reduce((s, x) => s + x.iva, 0));
  return { semIva, iva, comIva: r2(semIva + iva), taxas };
}

/** «6%», «23%». */
export const pct = (taxa: number) => `${Math.round(taxa * 100)}%`;
