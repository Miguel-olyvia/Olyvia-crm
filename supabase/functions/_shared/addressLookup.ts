/**
 * A coluna anew_addresses.address_key nao tem UNIQUE: uma edicao so de
 * maiusculas cria uma linha nova com a mesma chave. Com .maybeSingle() o
 * PostgREST devolve PGRST116 (2+ linhas), data fica null e o chamador
 * insere mais um duplicado. As funcoes passam a pedir
 * .order('created_at', { ascending: true }).limit(1) e escolhem aqui.
 */
export interface ExistingAddressRow {
  id: string | null;
}

export function pickExistingAddress(rows: unknown): { id: string } | null {
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    const id = (row as ExistingAddressRow | null)?.id;
    if (typeof id === 'string' && id.length > 0) return { id };
  }
  return null;
}
