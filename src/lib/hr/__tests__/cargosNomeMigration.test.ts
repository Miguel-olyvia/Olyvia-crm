/**
 * Paridade entre `chaveDoNomeDoCargo` (TypeScript) e `hr_cargo_nome_chave`
 * (migration 20261210160000), mais os contratos da migration que nenhum
 * compilador ve. Mesma excepcao deliberada a regra "nao testar SQL por texto"
 * de fluxo2CargoMigrations.test.ts: o COMPORTAMENTO da funcao e verificado ao
 * vivo no bloco de conferir da migration (que corre no `db push`); aqui so se
 * garante que os dois lados dizem o mesmo.
 */
import { describe, expect, it } from "vitest";
import { ACENTOS_DE, ACENTOS_PARA } from "@/lib/hr/cargosNome";
import { CODIGO_POR_TOKEN, CHAVE_POR_CODIGO } from "@/lib/hr/errosCargo";
import { MIGRATIONS, migrationPorVersao, semComentarios } from "./migrationSql";
import { CASOS_CHAVE } from "./cargosNomeCasos";

const VERSAO = "20261210160000";
const SQL = () => migrationPorVersao(VERSAO);
const normalizar = (sql: string) => sql.replace(/\s+/g, " ");

/** `U&'\00e0...'` -> o texto; uma string normal fica como esta (`''` -> `'`). */
function lerLiteral(prefixo: string | undefined, corpo: string): string {
  const texto = corpo.replace(/''/g, "'");
  if (!prefixo) return texto;
  return texto.replace(/\\([0-9a-fA-F]{4})/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
}

describe("hr_cargo_nome_chave: paridade com chaveDoNomeDoCargo", () => {
  const sql = () => semComentarios(SQL());

  it("o ficheiro existe, unico, e e posterior as do fluxo 2", () => {
    const nomes = Object.keys(MIGRATIONS).map((k) => k.split("/").pop() as string);
    expect(nomes.filter((n) => n.startsWith(`${VERSAO}_`))).toHaveLength(1);
    expect(nomes.some((n) => n.startsWith(`${VERSAO}_hr_cargos_nome_sem_duplicados`))).toBe(true);
    expect(Number(VERSAO)).toBeGreaterThan(20261210140000);
  });

  it("os acentos da funcao SQL sao EXACTAMENTE os do TypeScript (mesma ordem)", () => {
    const m = /translate\(\s*nome\s*,\s*(U&)?'((?:[^']|'')*)'\s*,\s*'([^']*)'\s*\)/.exec(
      normalizar(sql()),
    );
    expect(m, "translate(nome, <de>, <para>) na funcao").not.toBeNull();
    expect(lerLiteral(m?.[1], m?.[2] ?? "")).toBe(ACENTOS_DE);
    expect(m?.[3]).toBe(ACENTOS_PARA);
  });

  it("a SQL minuscula depois de tirar os acentos e tira tudo o que nao e letra nem digito", () => {
    const corpo = normalizar(sql());
    expect(corpo).toMatch(/regexp_replace\(\s*lower\(\s*translate\(/);
    expect(corpo).toContain("'[^[:alnum:]]'");
  });

  it("a funcao e IMMUTABLE, STRICT, PARALLEL SAFE, com search_path fixo e sem unaccent", () => {
    const corpo = normalizar(sql());
    const def = /CREATE OR REPLACE FUNCTION public\.hr_cargo_nome_chave\(.*?\$\$;/.exec(corpo)?.[0] ?? "";
    expect(def).toMatch(/IMMUTABLE/);
    expect(def).toMatch(/STRICT/);
    expect(def).toMatch(/PARALLEL SAFE/);
    expect(def).toMatch(/SET search_path TO 'pg_catalog', 'pg_temp'/);
    // os literais U&'...' so funcionam com standard_conforming_strings ligado, e o
    // corpo SQL e analisado em cada chamada: a funcao fixa-o.
    expect(def).toMatch(/SET standard_conforming_strings TO on/);
    expect(corpo).not.toMatch(/unaccent\s*\(/i);
  });

  it("o bloco CASOS-CHAVE da migration tem exactamente os casos partilhados", () => {
    const bruto = SQL();
    const bloco = /-- CASOS-CHAVE-INICIO([\s\S]*?)-- CASOS-CHAVE-FIM/.exec(bruto)?.[1] ?? "";
    const linhas = [...bloco.matchAll(/\(\s*(U&)?'((?:[^']|'')*)'\s*,\s*'([^']*)'\s*\)/g)].map(
      (m) => [lerLiteral(m[1], m[2]), m[3]] as const,
    );
    expect(linhas).toEqual(CASOS_CHAVE.map(([nome, chave]) => [nome, chave]));
  });
});

describe("20261210160000: contratos da migration", () => {
  const sql = () => semComentarios(SQL());

  it("avisa no cabecalho que precisa de codigo novo no mesmo commit (HRC14)", () => {
    expect(SQL()).toContain("PRECISA DE CODIGO NOVO NO MESMO COMMIT");
    expect(SQL()).toContain("HRC14");
  });

  it("aborta se ja houver duplicados, antes de criar o indice", () => {
    const corpo = sql();
    const iAborta = corpo.indexOf("cargos duplicados");
    const iIndice = corpo.indexOf("CREATE UNIQUE INDEX");
    expect(iAborta).toBeGreaterThan(-1);
    expect(iIndice).toBeGreaterThan(iAborta);
  });

  it("aborta tambem se a CHAVE de algum cargo existente for vazia, listando id, organizacao e nome", () => {
    const corpo = sql();
    const bloco = /DO \$vazios\$[\s\S]*?\$vazios\$;/.exec(corpo)?.[0] ?? "";
    expect(bloco).not.toBe("");
    expect(bloco).toMatch(/public\.hr_cargo_nome_chave\(c\.nome\) = ''/);
    expect(bloco).toMatch(/RAISE EXCEPTION/);
    expect(bloco).toMatch(/c\.id/);
    expect(bloco).toMatch(/c\.organization_id/);
    expect(bloco).toMatch(/c\.nome/);
    // antes de normalizar nomes e de criar o indice
    expect(corpo.indexOf("$vazios$")).toBeLessThan(corpo.indexOf("UPDATE public.hr_cargos"));
    expect(corpo.indexOf("$vazios$")).toBeLessThan(corpo.indexOf("CREATE UNIQUE INDEX"));
  });

  it("recusa um indice homonimo que nao seja o esperado (o IF NOT EXISTS ignoraria em silencio)", () => {
    const corpo = sql();
    const iGuarda = corpo.indexOf("$indice_previo$");
    expect(iGuarda).toBeGreaterThan(-1);
    expect(iGuarda).toBeLessThan(corpo.indexOf("CREATE UNIQUE INDEX"));
    const bloco = /DO \$indice_previo\$[\s\S]*?\$indice_previo\$;/.exec(corpo)?.[0] ?? "";
    expect(bloco).toContain("pg_get_indexdef");
    expect(bloco).toContain("hr_cargo_nome_chave");
    expect(bloco).toContain("organization_id");
    expect(bloco).toContain("indisunique");
  });

  it("o conferir verifica a EXPRESSAO do indice (pg_get_indexdef) e que e UNIQUE, nao so o nome", () => {
    const corpo = sql();
    const conferir = corpo.slice(corpo.indexOf("DO $conferir$"));
    expect(conferir).toContain("pg_get_indexdef");
    expect(conferir).toMatch(/position\('hr_cargo_nome_chave' IN/);
    expect(conferir).toMatch(/position\('organization_id' IN/);
    expect(conferir).toContain("i.indisunique");
  });

  it("o conferir prova que um cargo com deleted_at preenchido conta como existente", () => {
    const corpo = sql();
    const conferir = corpo.slice(corpo.indexOf("DO $conferir$"));
    expect(conferir).toMatch(/deleted_at/);
    expect(conferir).toContain("HR915");
    expect(conferir).toContain("HR916");
  });

  it("o cabecalho diz de onde vem hr_cargos nas duas numeracoes e avisa do REINDEX", () => {
    const bruto = SQL();
    const cabecalho = bruto.slice(0, bruto.indexOf("$guardas$"));
    expect(cabecalho).toContain("20261202070000");
    expect(cabecalho).toContain("20261207022100");
    expect(cabecalho).toMatch(/REINDEX/);
    expect(cabecalho).toContain("src/lib/hr/cargosNome.ts");
    expect(cabecalho).toMatch(/hr_cargo_nome_chave/);
  });

  it("cria o indice unico (organizacao, chave) e mantem o constraint antigo", () => {
    const corpo = normalizar(sql());
    expect(corpo).toMatch(
      /CREATE UNIQUE INDEX (IF NOT EXISTS )?hr_cargos_nome_chave_unica_por_org ON public\.hr_cargos \(organization_id, public\.hr_cargo_nome_chave\(nome\)\)/,
    );
    expect(corpo).not.toMatch(/DROP CONSTRAINT[^;]*hr_cargos_nome_unico_por_org/);
  });

  it("o trigger e BEFORE INSERT OR UPDATE OF nome, e INVOKER (um DEFINER vazaria nomes de outras organizacoes)", () => {
    const corpo = normalizar(sql());
    expect(corpo).toMatch(/BEFORE INSERT OR UPDATE OF nome ON public\.hr_cargos/);
    const def = /CREATE OR REPLACE FUNCTION public\.hr_cargos_nome_sem_duplicados\(\).*?\$\$;/.exec(corpo)?.[0] ?? "";
    expect(def).not.toMatch(/SECURITY DEFINER/);
    expect(def).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    expect(def).toContain("organization_id = NEW.organization_id");
    expect(def).toMatch(/id <> NEW\.id|id IS DISTINCT FROM NEW\.id/);
  });

  it("HRC14 com o token cargo_nome_duplicado e HRC03 para nome vazio ou sem letras", () => {
    const corpo = normalizar(sql());
    expect(corpo).toMatch(/'cargo_nome_duplicado: ja existe o cargo "%"%'/);
    expect(corpo).toMatch(/ERRCODE = 'HRC14'/);
    expect(corpo).toMatch(/'cargo_dados_invalidos: [^;]*ERRCODE = 'HRC03'/);
    expect(CODIGO_POR_TOKEN.cargo_nome_duplicado).toBe("HRC14");
    expect(CHAVE_POR_CODIGO.HRC14).toBe("hr.cargos.erro.nomeDuplicado");
  });

  it("nenhum RAISE usa % a mais ou a menos em relacao aos argumentos (o % solto rebenta o RAISE)", () => {
    let verificados = 0;
    let verificadosE = 0;
    for (const comando of sql().split(/RAISE\s+(?:EXCEPTION|NOTICE)\b/).slice(1)) {
      const m = /^\s*(E)?'((?:[^']|'')*)'/.exec(comando);
      const texto = m?.[2];
      if (texto === undefined) continue;
      verificados += 1;
      if (m?.[1]) verificadosE += 1;
      const pedidos = (texto.match(/%%|%/g) ?? []).filter((p) => p === "%").length;
      const resto = comando.slice(m?.[0].length ?? 0);
      const args = /^\s*,([^;]*?)(?:\bUSING\b|;|$)/.exec(resto + ";")?.[1] ?? "";
      const dados = args.trim() === "" ? 0 : args.split(/,(?![^(]*\))/).length;
      expect(dados, texto).toBe(pedidos);
    }
    // os RAISE com E'...' (a verificacao previa) tambem entram na contagem
    expect(verificados).toBeGreaterThan(10);
    expect(verificadosE).toBeGreaterThanOrEqual(2);
  });

  it("a funcao da chave so e executavel por authenticated e service_role", () => {
    const corpo = normalizar(sql());
    expect(corpo).toContain("REVOKE ALL ON FUNCTION public.hr_cargo_nome_chave(text) FROM PUBLIC;");
    expect(corpo).toContain("REVOKE ALL ON FUNCTION public.hr_cargo_nome_chave(text) FROM anon;");
    expect(corpo).toContain("GRANT EXECUTE ON FUNCTION public.hr_cargo_nome_chave(text) TO authenticated;");
    expect(corpo).toContain("GRANT EXECUTE ON FUNCTION public.hr_cargo_nome_chave(text) TO service_role;");
  });

  it("nao toca nas grants de colunas de hr_cargos (authenticated continua sem salario_base)", () => {
    const corpo = sql();
    expect(corpo).not.toMatch(/(GRANT|REVOKE)[^;]*ON TABLE public\.hr_cargos/);
    expect(corpo).not.toMatch(/GRANT SELECT \(/);
  });

  it("acaba o conferir com HR900, nao desliga triggers, e esta em CRLF", () => {
    const corpo = sql();
    expect(corpo).toContain("HR900");
    expect(corpo).not.toMatch(/session_replication_role/i);
    expect(corpo).not.toMatch(/DISABLE TRIGGER/i);
    const bruto = SQL();
    const crlf = (bruto.match(/\r\n/g) ?? []).length;
    const lf = (bruto.match(/\n/g) ?? []).length;
    expect(lf).toBeGreaterThan(50);
    expect(crlf).toBe(lf);
  });
});
