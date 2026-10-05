/**
 * Nomes de tarefas curtos. As tarefas que vêm de um serviço chamam-se
 * "<serviço>: <passo>" — e o nome do serviço pode ser enorme ("MO Modelo 3 -
 * Casa de Banho: Remoção de Banheira … até teto: Isolamento e proteção da
 * área"). Numa lista em que o mesmo serviço se repete, mostra-se só o passo;
 * o serviço passa a uma etiqueta curta, e só se houver mais do que um.
 * A base guarda o nome completo (é o que fica no `title`).
 */

export interface NomeCurto {
  /** O passo ("Isolamento e proteção da área"), ou o nome inteiro. */
  curto: string;
  /** O serviço de onde veio, se o prefixo se repete; senão null. */
  servico: string | null;
}

/** Separa "<serviço>: <passo>" pelo ÚLTIMO ": " (o nome do serviço também pode ter ":"). */
export function separarNome(nome: string): { prefixo: string | null; resto: string } {
  const i = nome.lastIndexOf(": ");
  if (i <= 0 || i + 2 >= nome.length) return { prefixo: null, resto: nome.trim() };
  return { prefixo: nome.slice(0, i).trim(), resto: nome.slice(i + 2).trim() };
}

/** O nome curto de cada tarefa, a partir de todas as da lista (o prefixo só sai se se repete). */
export function nomesCurtos<T extends { id: string; nome: string }>(tarefas: readonly T[]): Map<string, NomeCurto> {
  const partes = tarefas.map((t) => ({ id: t.id, ...separarNome(t.nome) }));
  const conta = new Map<string, number>();
  for (const p of partes) if (p.prefixo) conta.set(p.prefixo, (conta.get(p.prefixo) ?? 0) + 1);
  const out = new Map<string, NomeCurto>();
  for (const p of partes) {
    const repete = !!p.prefixo && (conta.get(p.prefixo) ?? 0) >= 2;
    out.set(p.id, repete ? { curto: p.resto, servico: p.prefixo } : { curto: tarefas.find((t) => t.id === p.id)!.nome, servico: null });
  }
  return out;
}

/** Quantos serviços diferentes há na lista (com prefixo que se repete). */
export function servicosDistintos(nomes: ReadonlyMap<string, NomeCurto>): number {
  return new Set([...nomes.values()].map((n) => n.servico).filter(Boolean)).size;
}

/**
 * A etiqueta do serviço: sem o "MO " do catálogo e só até ao primeiro ":"
 * ("MO Modelo 3 - Casa de Banho: Remoção…" → "Modelo 3 - Casa de Banho"),
 * cortada a `max` letras.
 */
export function etiquetaServico(servico: string, max = 32): string {
  let s = servico.replace(/^MO\s+/i, "").trim();
  const i = s.indexOf(":");
  if (i > 0) s = s.slice(0, i).trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
