/**
 * Quando dois nomes de cargo sao o mesmo.
 *
 * A REGRA
 * -------
 * Dois nomes sao o mesmo cargo se tiverem a mesma CHAVE: minusculas, sem
 * acentos e sem tudo o que nao seja letra ou digito. "Tecnico(a)", "tecnico a" e
 * "Tecnico (a)" (com acento) tem a chave "tecnicoa". Vale tambem para cargos
 * desactivados. Em organizacoes diferentes o mesmo nome e permitido.
 *
 * ESPELHO DA BASE
 * ---------------
 * `chaveDoNomeDoCargo` e o espelho EXACTO de `public.hr_cargo_nome_chave`
 * (migration 20261210160000): a mesma lista de acentos, pela mesma ordem, e a
 * mesma ordem de passos (tirar acentos, minusculas, tirar o que nao e letra nem
 * digito). A base e quem decide (indice unico + trigger com HRC14); isto so
 * serve para avisar o utilizador ANTES de gravar. `cargosNomeMigration.test.ts`
 * confirma que a lista de acentos da migration e esta, e a migration corre os
 * mesmos casos de `__tests__/cargosNomeCasos.ts` no `db push`.
 *
 * Os acentos tratados sao os latinos comuns (portugues, espanhol, frances,
 * alemao, e europeu de leste). Fora desta lista a letra fica como esta (um
 * nome em grego ou cirilico continua a ter chave propria).
 */

/** Cada grupo: a letra base e as minusculas acentuadas que lhe correspondem. */
const GRUPOS_DE_ACENTOS: ReadonlyArray<readonly [string, string]> = [
  ["a", "àáâãäåāăą"],
  ["c", "çćč"],
  ["d", "ďđ"],
  ["e", "èéêëēěę"],
  ["g", "ğ"],
  ["i", "ìíîïī"],
  ["l", "ł"],
  ["n", "ñńň"],
  ["o", "òóôõöøōő"],
  ["s", "šśş"],
  ["t", "ţť"],
  ["u", "ùúûüūůűų"],
  ["y", "ýÿ"],
  ["z", "žźż"],
];

/** Os caracteres acentuados (minuscula e maiuscula, par a par) -- o 2.o argumento do `translate`. */
export const ACENTOS_DE: string = GRUPOS_DE_ACENTOS.flatMap(([, acentuadas]) =>
  [...acentuadas].map((c) => c + c.toUpperCase()),
).join("");

/** A letra base de cada um de `ACENTOS_DE`, na mesma ordem -- o 3.o argumento do `translate`. */
export const ACENTOS_PARA: string = GRUPOS_DE_ACENTOS.flatMap(([base, acentuadas]) =>
  [...acentuadas].map(() => base + base),
).join("");

const BASE_POR_ACENTO: ReadonlyMap<string, string> = new Map(
  [...ACENTOS_DE].map((c, i) => [c, [...ACENTOS_PARA][i]] as const),
);

/**
 * A chave do nome (ver o topo). Texto vazio, so pontuacao e entradas que nao
 * sao texto dao "". A funcao SQL e STRICT: NULL da NULL, e aqui "".
 */
export function chaveDoNomeDoCargo(nome: string): string {
  if (typeof nome !== "string") return "";
  let semAcentos = "";
  for (const c of nome) semAcentos += BASE_POR_ACENTO.get(c) ?? c;
  return semAcentos.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** O nome como a base o grava: sem espacos nas pontas e com os do meio colapsados. */
export function normalizarNomeDoCargo(nome: string): string {
  return nome.replace(/\s+/g, " ").trim();
}

export interface CargoComNome {
  id: string;
  nome: string;
  activo: boolean;
}

/**
 * O OUTRO cargo (da mesma lista, ou seja, da mesma organizacao) com a mesma
 * chave, activo ou nao; `null` se nao ha. `ignorarId` e o cargo em edicao: um
 * cargo nao colide consigo proprio. Um nome sem letras nem digitos (chave "")
 * nunca colide: a base recusa-o a parte (HRC03).
 */
export function cargoComMesmoNome<T extends CargoComNome>(
  cargos: readonly T[],
  nome: string,
  ignorarId?: string | null,
): T | null {
  const chave = chaveDoNomeDoCargo(nome);
  if (chave === "") return null;
  return cargos.find((c) => c.id !== ignorarId && chaveDoNomeDoCargo(c.nome) === chave) ?? null;
}
