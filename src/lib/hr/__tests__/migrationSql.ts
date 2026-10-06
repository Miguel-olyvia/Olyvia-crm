/**
 * Auxiliares partilhados pelos testes de CONTEUDO das migrations da admissao
 * (loteAAdmissaoMigrations, loteBBicMigrations). Nao e um teste: nao tem `.test.`
 * no nome, por isso o vitest nao o corre.
 *
 * Le sempre a migration pelo nome da versao, e para as funcoes antigas a MAIS
 * RECENTE por ordem de nome.
 */

export const MIGRATIONS = import.meta.glob("../../../../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function migrationPorVersao(versao: string): string {
  const chave = Object.keys(MIGRATIONS).find((k) => k.includes(`/${versao}_`));
  if (!chave) throw new Error(`Migration ${versao} nao encontrada.`);
  return MIGRATIONS[chave];
}

export function padraoDeCriacao(nomeFuncao: string): RegExp {
  return new RegExp("CREATE (?:OR REPLACE )?FUNCTION public\\." + nomeFuncao + "\\(");
}

/** A migration mais recente (por nome) que define esta funcao. */
export function migrationQueDefine(nomeFuncao: string): string {
  const padrao = padraoDeCriacao(nomeFuncao);
  const candidatas = Object.keys(MIGRATIONS)
    .sort()
    .filter((ficheiro) => padrao.test(MIGRATIONS[ficheiro]));
  if (candidatas.length === 0) throw new Error(`Nenhuma migration define public.${nomeFuncao}.`);
  return MIGRATIONS[candidatas[candidatas.length - 1]];
}

/** O corpo entre `AS $$` e o `$$;` seguinte, a partir da definicao da funcao. */
export function corpoDaFuncao(sql: string, nomeFuncao: string): string {
  const inicio = sql.search(padraoDeCriacao(nomeFuncao));
  const abre = sql.indexOf("AS $$", inicio);
  const fecha = sql.indexOf("$$;", abre);
  if (inicio < 0 || abre < 0 || fecha < 0) {
    throw new Error(`Nao consegui isolar o corpo de public.${nomeFuncao}.`);
  }
  return sql.slice(abre, fecha);
}

/** Tira os comentarios de linha (--): os testes olham para o codigo, nao para a prosa. */
export function semComentarios(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

/** O comando GRANT/REVOKE de uma funcao existe, tal como esta escrito. */
export function temComando(sql: string, comando: string): boolean {
  return sql.replace(/\s+/g, " ").includes(comando);
}

export interface CampoSql {
  codigo: string;
  origem: string;
  condicional: boolean;
}

/** As linhas ('codigo', 'origem', condicional) de hr_admissao_campos_obrigatorios() desta migration. */
export function camposObrigatoriosDe(sql: string): CampoSql[] {
  const corpo = corpoDaFuncao(sql, "hr_admissao_campos_obrigatorios");
  return [...corpo.matchAll(/\('([a-z0-9_]+)',\s*'(pessoa|rh)',\s*(true|false)\)/g)].map((m) => ({
    codigo: m[1],
    origem: m[2],
    condicional: m[3] === "true",
  }));
}
