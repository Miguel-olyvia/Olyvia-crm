/**
 * @vitest-environment node
 */
// 25/11: as migrations do aspeto nas opções (20270126400000) e da configuração 3D (20270126410000) lidas como TEXTO.
// Confere o que se pode conferir sem as correr: guardas com os md5 lidos no remoto, nenhuma assinatura existente mudada
// (sem DROP FUNCTION, cat_guardar_opcao/cat_editar_opcao intocadas), REVOKE antes de GRANT em cada função nova, a
// tabela nova fechada (só SELECT a authenticated, sem políticas de escrita) e os % dos RAISE com parâmetro.
// Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function ler(nome: string): { bruto: string; sql: string } {
  const caminho = resolve(process.cwd(), `supabase/migrations/${nome}`);
  const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
  /** Sem comentários de linha e com os espaços normalizados. */
  const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");
  return { bruto, sql };
}

const A = ler("20270126400000_catalogo_aspeto_na_opcao.sql");
const B = ler("20270126410000_catalogo_config_3d.sql");

/** O corpo de uma função (entre o CREATE e o próximo `END $function$;`). */
function corpo(sql: string, nome: string): string {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
  if (i < 0) return "";
  const fim = sql.indexOf("$function$;", sql.indexOf("AS $function$", i) + 13);
  return sql.slice(i, fim + 11);
}

/** Quantos argumentos vêm depois da mensagem de um RAISE (vírgulas ao nível de topo, fora de parênteses e de texto). */
function contarArgs(resto: string): number {
  const antes = resto.split(/\bUSING\b/)[0];
  let nivel = 0;
  let texto = false;
  let atual = "";
  const partes: string[] = [];
  for (const ch of antes) {
    if (ch === "'") texto = !texto;
    if (!texto && ch === "(") nivel++;
    if (!texto && ch === ")") nivel--;
    if (!texto && nivel === 0 && ch === ",") {
      partes.push(atual);
      atual = "";
    } else atual += ch;
  }
  partes.push(atual);
  return partes.filter((p) => p.trim()).length;
}

describe.each([
  ["20270126400000 (aspeto)", A],
  ["20270126410000 (config 3D)", B],
])("migration %s", (_nome, m) => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(m.bruto.length).toBeGreaterThan(0);
    expect(m.bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(m.bruto)).toBe(false);
  });

  it("diz no cabeçalho que a migration e o código entram juntos, que é só para a RH e que a base tem a Mudelar", () => {
    expect(m.bruto).toMatch(/MIGRATION E CÓDIGO ENTRAM\s+(--\s*!!!\s*)?JUNTOS/);
    expect(m.bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(m.bruto).toMatch(/esta base tem a Mudelar/);
  });

  it("sem DROP FUNCTION, sem tocar em cat_guardar_opcao/cat_editar_opcao e com guarda e conferir", () => {
    expect(m.sql).not.toMatch(/\bDROP FUNCTION\b/i);
    expect(m.sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.cat_(guardar|editar)_opcao\(/);
    expect(m.sql).toContain("DO $guarda$");
    expect(m.sql).toContain("DO $conferir$");
  });

  it("os RAISE com % têm tantos parâmetros quantas marcas", () => {
    for (const r of m.sql.matchAll(/RAISE (?:EXCEPTION|NOTICE) '((?:[^']|'')*)'([^;]*);/g)) {
      const marcas = (r[1].replace(/%%/g, "").match(/%/g) ?? []).length;
      expect({ msg: r[1], marcas }).toEqual({ msg: r[1], marcas: contarArgs(r[2]) });
    }
  });

  it("concatenações e comparações com contype usam ::text", () => {
    expect(m.sql).not.toMatch(/contype\s*(=|\|\|)/);
  });
});

describe("20270126400000 — «Tem aspeto»", () => {
  const { sql } = A;

  it("a guarda leva os md5 lidos no remoto a 25/11 (3 leituras que mudam e 2 que não se tocam)", () => {
    for (const md5 of [
      "969e8a34b6bb2435138c06fecce8e23e",
      "5587a407f8e8b30a6e15cd85e754e45b",
      "fa4c5bbceef2faff24b9eae6d65bc17e",
      "25327c5d0a887e0a9106a496b00231f8",
      "e7fd2bbb229ea6abf74a5da0cc6254c9",
    ]) {
      expect(sql).toContain(`'${md5}'`);
    }
  });

  it("colunas desligadas e CHECKs (medida sem aspeto; superfície numa lista fechada ou NULL)", () => {
    expect(sql).toContain("ADD COLUMN has_aspect boolean NOT NULL DEFAULT false");
    expect(sql).toContain("CHECK (NOT has_aspect OR NOT is_measurement)");
    expect(sql).toContain("ADD COLUMN is_metal boolean NOT NULL DEFAULT false");
    expect(sql).toContain("ADD COLUMN superficie text NULL");
    expect(sql).toContain("CHECK (superficie IS NULL OR superficie IN ('polida', 'acetinada', 'mate'))");
  });

  it.each([
    ["cat_definir_aspeto_atributo", "uuid,uuid,boolean"],
    ["cat_aspeto_opcao", "uuid,uuid,boolean,text"],
  ])("%s: SECURITY DEFINER, products.edit, e REVOKE de PUBLIC/anon antes do GRANT", (f, args) => {
    const c = corpo(sql, f);
    expect(c).toMatch(/SECURITY DEFINER SET search_path TO 'public', 'pg_temp'/);
    expect(c).toContain("public.fn_cat_exigir(p_org, 'products.edit')");
    expect(c).toMatch(/organization_id = p_org/);
    const revoke = sql.indexOf(`REVOKE ALL ON FUNCTION public.${f}(${args}) FROM PUBLIC, anon;`);
    const grant = sql.indexOf(`GRANT EXECUTE ON FUNCTION public.${f}(${args}) TO authenticated, service_role;`);
    expect(revoke).toBeGreaterThan(sql.indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`));
    expect(grant).toBeGreaterThan(revoke);
  });

  it("cat_aspeto_opcao recusa sem «Tem aspeto», só aceita as três superfícies e '' limpa", () => {
    const c = corpo(sql, "cat_aspeto_opcao");
    expect(c).toContain("IF NOT a.tem_aspeto THEN");
    expect(c).toContain("v_sup NOT IN ('polida', 'acetinada', 'mate')");
    expect(c).toMatch(/ELSIF btrim\(p_superficie\) = '' THEN v_sup := NULL;/);
    expect(c).toContain("fn_cat_grupo_do_atributo(a.id, p_org)");
  });

  it.each(["cat_ler_atributos", "cat_ler_atributos_gestao", "cat_ler_atributos_definicoes"])(
    "%s: mesma assinatura, 'tem_aspeto' no atributo e metal/superfície só quando tem aspeto",
    (f) => {
      const c = corpo(sql, f);
      expect(c).toContain(`CREATE OR REPLACE FUNCTION public.${f}(p_org uuid) RETURNS jsonb`);
      expect(c).toContain("a.has_aspect AS tem_aspeto");
      expect(c).toContain("'tem_aspeto', a.tem_aspeto");
      expect(c).toContain("'metal', CASE WHEN a.tem_aspeto THEN o.metal END");
      expect(c).toContain("'superficie', CASE WHEN a.tem_aspeto THEN o.superficie END");
      // o que já lá estava continua
      expect(c).toContain("'tem_foto', a.tem_foto");
      expect(c).toContain("'foto', o.foto");
    },
  );

  it("não mexe em dados fora das funções", () => {
    let fora = sql;
    for (const f of ["cat_definir_aspeto_atributo", "cat_aspeto_opcao"]) fora = fora.replace(corpo(sql, f), "");
    expect(fora).not.toMatch(/\b(INSERT INTO|DELETE FROM)\b/i);
    expect(fora).not.toMatch(/\bUPDATE (public\.)?(product_attributes|attribute_option_group_values)\b/i);
  });
});

describe("20270126410000 — configuração 3D", () => {
  const { sql } = B;

  it("a tabela nasce fechada: RLS, REVOKE ALL de PUBLIC/anon/authenticated e só SELECT a authenticated", () => {
    expect(sql).toContain("ALTER TABLE public.cat_config_3d ENABLE ROW LEVEL SECURITY;");
    const revoke = sql.indexOf("REVOKE ALL ON public.cat_config_3d FROM PUBLIC, anon, authenticated;");
    const grant = sql.indexOf("GRANT SELECT ON public.cat_config_3d TO authenticated;");
    expect(revoke).toBeGreaterThan(sql.indexOf("CREATE TABLE public.cat_config_3d"));
    expect(grant).toBeGreaterThan(revoke);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL|TRUNCATE)[^;]*ON (TABLE )?public\.cat_config_3d[^;]*\b(authenticated|anon)\b/i);
  });

  it("uma só política, de SELECT, com products.view OU services.view OU products.edit", () => {
    const politicas = [...sql.matchAll(/CREATE POLICY \w+ ON public\.cat_config_3d FOR (\w+)/g)].map((r) => r[1]);
    expect(politicas).toEqual(["SELECT"]);
    expect(sql).toMatch(
      /fn_cat_pode\(organization_id, 'products\.view'\) OR public\.fn_cat_pode\(organization_id, 'services\.view'\) OR public\.fn_cat_pode\(organization_id, 'products\.edit'\)/,
    );
  });

  it("os CHECKs: um alvo, alguma coisa, e a forma do JSON pela função pura; UNIQUE por alvo", () => {
    expect(sql).toContain("CHECK (num_nonnulls(produto_id, categoria_id) = 1)");
    expect(sql).toContain("CHECK (eixos IS NOT NULL OR ligacoes IS NOT NULL)");
    expect(sql).toContain("CHECK (public.fn_cat_config_3d_forma(eixos, ligacoes))");
    expect(sql).toContain("UNIQUE (produto_id)");
    expect(sql).toContain("UNIQUE (categoria_id)");
  });

  it("fn_cat_config_3d_forma é pura (sql IMMUTABLE, search_path pg_catalog), limita a 60 e guarda a ordem com CASE", () => {
    const c = corpo(sql, "fn_cat_config_3d_forma");
    expect(c).toContain("LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'pg_catalog'");
    expect(c).not.toMatch(/SECURITY DEFINER/);
    expect(c).not.toMatch(/\bFROM (public\.)?\w*(products|attributes|categories|cat_config_3d)\b/);
    expect(c).toMatch(/WHEN jsonb_typeof\(p_ligacoes\) <> 'array' THEN false WHEN jsonb_array_length\(p_ligacoes\) > 60 THEN false/);
    expect(c).toContain("'^[a-z_]{1,20}$'");
  });

  it.each([
    ["fn_cat_config_3d_forma", "jsonb,jsonb"],
    ["cat_definir_config_3d", "uuid,text,uuid,jsonb,jsonb"],
    ["cat_ler_config_3d", "uuid,text,uuid"],
  ])("%s: REVOKE de PUBLIC/anon depois do CREATE e antes do GRANT", (f, args) => {
    const revoke = sql.indexOf(`REVOKE ALL ON FUNCTION public.${f}(${args}) FROM PUBLIC, anon;`);
    const grant = sql.indexOf(`GRANT EXECUTE ON FUNCTION public.${f}(${args}) TO authenticated, service_role;`);
    expect(revoke).toBeGreaterThan(sql.indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`));
    expect(grant).toBeGreaterThan(revoke);
  });

  it("escrever exige products.edit; ler exige products.view, services.view ou products.edit (decisão do dono)", () => {
    const d = corpo(sql, "cat_definir_config_3d");
    const l = corpo(sql, "cat_ler_config_3d");
    expect(d).toContain("public.fn_cat_exigir(p_org, 'products.edit')");
    expect(l).toContain("public.fn_cat_exigir_uma(p_org, ARRAY['products.view', 'services.view', 'products.edit'])");
    for (const c of [d, l]) {
      expect(c).toMatch(/SECURITY DEFINER SET search_path TO 'public', 'pg_temp'/);
      expect(c).toMatch(/p\.organization_id = p_org/);
      expect(c).toMatch(/c\.organization_id = p_org/);
    }
    expect(l).toMatch(/STABLE SECURITY DEFINER/);
  });

  it("cat_definir_config_3d: limite de tamanho antes do trabalho, atributos da organização contados distintos, os dois NULL apagam", () => {
    const d = corpo(sql, "cat_definir_config_3d");
    expect(d).toMatch(/pg_column_size\(p_ligacoes\) > c_max_bytes/);
    expect(d.indexOf("pg_column_size")).toBeLessThan(d.indexOf("FROM products p"));
    expect(d).toMatch(/count\(DISTINCT x\.a\)::integer, count\(DISTINCT pa\.id\)::integer/);
    expect(d).toMatch(/pa\.organization_id = p_org AND pa\.deleted_at IS NULL AND NOT pa\.is_measurement/);
    expect(d).toMatch(/IF v_eixos IS NULL AND v_lig IS NULL THEN/);
    expect(d).toContain("ON CONFLICT (produto_id) DO UPDATE");
    expect(d).toContain("ON CONFLICT (categoria_id) DO UPDATE");
    expect(d).toContain("pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || p_org::text, 0))");
  });

  it("cat_ler_config_3d: categoria como cat_ler_produto, órfãs contadas e as quatro origens", () => {
    const l = corpo(sql, "cat_ler_config_3d");
    expect(l).toContain("coalesce(p.category_id, s.parent_id)");
    expect(l).toContain("'orfas', v_pr_orfas");
    for (const o of ["'subcategoria'", "'categoria'", "'automatico'", "'produto'"]) expect(l).toContain(o);
    expect(l).not.toMatch(/\bpg_(class|proc|catalog|namespace)\b/);
  });

  it("só o cat_definir_config_3d escreve na tabela", () => {
    const semDefinir = sql.replace(corpo(sql, "cat_definir_config_3d"), "");
    expect(semDefinir).not.toMatch(/\b(INSERT INTO|DELETE FROM|UPDATE) (public\.)?cat_config_3d\b/i);
  });
});
