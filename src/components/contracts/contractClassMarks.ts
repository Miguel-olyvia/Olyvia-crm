// Marcas por classe no html de um contrato (olv-versao, olv-assinaturas…). Só classes: o sanitizador do html
// corta os atributos data-*. Compara-se por TOKEN inteiro: «olv-assinaturas-extra» não é «olv-assinaturas».

const RE_CLASSE = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** O html (texto) tem algum elemento cuja classe contém um destes tokens? */
export function htmlTemClasse(html: string | null | undefined, ...tokens: string[]): boolean {
  if (!html || tokens.length === 0) return false;
  for (const m of html.matchAll(RE_CLASSE)) {
    const presentes = (m[1] ?? m[2] ?? "").split(/\s+/);
    if (tokens.some((t) => presentes.includes(t))) return true;
  }
  return false;
}
