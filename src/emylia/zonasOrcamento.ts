// As zonas da obra no orçamento (26/10/2026): o caso real P-2026-0109 junta a casa, duas casas de banho e a cozinha numa só proposta.
// Cada serviço continua numa só linha (as contas do custo, das horas e do plano procuram o serviço pela linha e não mudam); as zonas
// repartem a quantidade da linha e, nos materiais, também o valor (o mesmo artigo pode ter um preço em cada zona: a tomada a 8,00 € numa
// e a 8,75 € noutra). A proposta agrupa as linhas por zona, com o subtotal de cada uma. Sem zonas no orçamento, fica tudo como era.
import type { LinhaOrc, Orcamento } from "./motor";

/** A parte de uma linha numa zona: a quantidade e, só nos materiais, o valor sem IVA (sem ele, a parte da quantidade). */
export interface ZonaLinha { z: string; q: number; preco?: number }
/** Onde ficam, na proposta, as linhas sem zona quando o orçamento tem zonas. */
export const SEM_ZONA = "Outros trabalhos";

const r2 = (x: number) => Math.round(x * 100) / 100;
const chave = (s: string) => s.trim().toLowerCase();

/** Os nomes das zonas como se guardam: sem espaços a mais, sem vazios e sem repetidos (pela primeira vez que aparecem). */
export function limparZonas(nomes: string[]): string[] {
  const vistos = new Set<string>(), r: string[] = [];
  for (const n of nomes) {
    const t = n.trim().replace(/\s+/g, " ");
    if (!t || vistos.has(chave(t)) || chave(t) === chave(SEM_ZONA)) continue;
    vistos.add(chave(t)); r.push(t);
  }
  return r;
}

/** O que está errado na repartição de uma linha pelas zonas (null: está certa). `q` é a quantidade da linha toda. */
export function erroZonasLinha(l: LinhaOrc, zs: ZonaLinha[], zonas: string[], q: number): string | null {
  if (!zs.length) return "Escolha pelo menos uma zona.";
  if (zs.some((x) => !zonas.some((z) => chave(z) === chave(x.z)))) return "Essa zona não está nas zonas do orçamento.";
  if (new Set(zs.map((x) => chave(x.z))).size < zs.length) return "A mesma zona aparece duas vezes.";
  if (zs.some((x) => !(x.q > 0))) return "Cada zona tem de ter uma quantidade maior do que zero.";
  const soma = r2(zs.reduce((a, x) => a + x.q, 0));
  if (Math.abs(soma - q) > 0.005) return `As zonas somam ${String(soma).replace(".", ",")}: têm de somar a quantidade da linha (${String(r2(q)).replace(".", ",")}).`;
  const comPreco = zs.filter((x) => x.preco != null).length;
  if (comPreco && l.t === "svc") return "Nos serviços, o preço é o mesmo em todas as zonas: mude o preço da linha.";
  if (comPreco && comPreco < zs.length) return "Escreva o valor de todas as zonas, ou de nenhuma.";
  if (zs.some((x) => x.preco != null && !(x.preco >= 0))) return "O valor de cada zona tem de ser um número positivo.";
  return null;
}

/** O valor de cada zona da linha (sem IVA, antes do desconto); `valor` é o da linha toda. A última zona leva o resto dos cêntimos,
 *  para a soma bater sempre com a linha. */
export function valoresPorZona(l: LinhaOrc, valor: number, q: number): { z: string; q: number; valor: number }[] {
  const zs = l.zonas ?? [];
  if (!zs.length) return [];
  let resto = r2(valor);
  return zs.map((x, i) => {
    const v = i === zs.length - 1 ? resto
      : x.preco != null ? r2(x.preco)
        : l.t === "svc" ? r2(x.q * l.pu) : r2(q > 0 ? (valor * x.q) / q : 0);
    resto = r2(resto - v);
    return { z: x.z, q: x.q, valor: v };
  });
}

export interface LinhaNaZona { i: number; q: number; valor: number }
export interface GrupoZona { z: string; linhas: LinhaNaZona[]; total: number }

/** As linhas do orçamento por zona, pela ordem das zonas; no fim, as linhas sem zona. Sem zonas no orçamento: []. */
export function porZona(o: Orcamento, valorDe: (l: LinhaOrc) => number, qDe: (l: LinhaOrc) => number): GrupoZona[] {
  const zonas = o.zonas ?? [];
  if (!zonas.length) return [];
  const G = new Map<string, GrupoZona>(zonas.map((z) => [chave(z), { z, linhas: [], total: 0 }]));
  const sem: GrupoZona = { z: SEM_ZONA, linhas: [], total: 0 };
  o.linhas.forEach((l, i) => {
    const v = valorDe(l), q = qDe(l);
    const partes = valoresPorZona(l, v, q);
    if (!partes.length) { sem.linhas.push({ i, q, valor: r2(v) }); return; }
    for (const p of partes) (G.get(chave(p.z)) ?? sem).linhas.push({ i, q: p.q, valor: p.valor });
  });
  return [...G.values(), sem].filter((g) => g.linhas.length).map((g) => ({ ...g, total: r2(g.linhas.reduce((a, x) => a + x.valor, 0)) }));
}
