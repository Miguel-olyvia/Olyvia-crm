/**
 * Os casos da CHAVE do nome do cargo, partilhados pelos dois lados da regra:
 *
 *   - `cargosNome.test.ts` corre-os contra `chaveDoNomeDoCargo` (TypeScript);
 *   - `cargosNomeMigration.test.ts` exige que o bloco CASOS-CHAVE da migration
 *     20261210160000 (que a base corre com `hr_cargo_nome_chave` no `db push`)
 *     tenha EXACTAMENTE estes casos.
 *
 * Assim, mudar a regra de um lado so parte um teste. Nao e um teste: nao tem
 * `.test.` no nome, por isso o vitest nao o corre.
 */

/** [nome tal como se escreve, chave que os dois lados tem de calcular]. */
export const CASOS_CHAVE: ReadonlyArray<readonly [string, string]> = [
  // Os quatro do problema (todos acabam no mesmo cargo)
  ["Administrativo(a)", "administrativoa"],
  ["administrativo(a)", "administrativoa"],
  ["Administrativo(a) ", "administrativoa"],
  ["Administrativo (a)", "administrativoa"],
  // Acentos e pontuacao
  ["Tecnico(a)", "tecnicoa"],
  ["tecnico a", "tecnicoa"],
  ["Técnico (a)", "tecnicoa"],
  ["Conceição", "conceicao"],
  ["AÇÃO Ñandu", "acaonandu"],
  ["Łódź", "lodz"],
  ["Diretor/a", "diretora"],
  // Digitos contam
  ["Gestor de Operações 2", "gestordeoperacoes2"],
  ["Gestor de Operações 3", "gestordeoperacoes3"],
  // Sem nenhuma letra ou digito: chave vazia
  ["", ""],
  ["   ", ""],
  ["---", ""],
  ["(  )", ""],
];
