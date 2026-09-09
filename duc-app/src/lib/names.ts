interface EntityNameRow {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

/**
 * Nome apresentável de uma entidade/cliente.
 * Corrige o caso comum de nome duplicado ("Ana Silva Ana Silva") que vem de
 * dados onde display_name já contém o nome completo repetido, ou first_name e
 * last_name são iguais.
 */
export function entityDisplayName(row: EntityNameRow): string {
  const raw =
    row.display_name?.trim() ||
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    "Cliente sem nome";
  return dedupeRepeatedName(raw);
}

function dedupeRepeatedName(s: string): string {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length % 2 === 0) {
    const half = words.length / 2;
    const a = words.slice(0, half).join(" ");
    const b = words.slice(half).join(" ");
    if (a.toLowerCase() === b.toLowerCase()) return a;
  }
  return words.join(" ");
}
