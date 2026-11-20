/**
 * @vitest-environment node
 */
// 20/11: a migration das famílias (20270125100000) lida como TEXTO. Confere o que se pode conferir sem a correr: as três tabelas fechadas nas 4 operações
// (RLS, REVOKE, nenhuma política de escrita, nenhum GRANT de tabela), as funções SECURITY DEFINER com search_path e EXECUTE só para authenticated, a máscara
// de custo e PVP igual à de cat_ler_produtos_pagina, e que não há INSERT de dados. Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const caminho = resolve(process.cwd(), "supabase/migrations/20270125100000_catalogo_familias.sql");
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");
const TABELAS = ["product_families", "product_family_axes", "product_family_members"];
const FUNCOES = ["cat_ler_familias", "cat_ler_familia", "cat_familias_dos_produtos", "cat_guardar_familia", "cat_apagar_familia"];

/** O corpo de uma função (entre o CREATE e o próximo `END $$;`). */
function corpo(nome: string): string {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
  if (i < 0) return "";
  return sql.slice(i, sql.indexOf("END $$;", i) + 7);
}
const contar = (texto: string, agulha: string): number => texto.split(agulha).length - 1;

describe("migration 20270125100000_catalogo_familias.sql", () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("diz no cabeçalho que a migration e o código entram juntos", () => {
    expect(bruto).toMatch(/MIGRATION E CÓDIGO ENTRAM JUNTOS/);
  });

  it.each(TABELAS)("%s: RLS ligada, REVOKE ALL de PUBLIC/anon/authenticated e só a política de SELECT", (t) => {
    expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
    expect(sql).toContain(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated;`);
    const politicas = [...sql.matchAll(new RegExp(`CREATE POLICY \\w+ ON public\\.${t} FOR (\\w+)`, "g"))].map((m) => m[1]);
    expect(politicas).toEqual(["SELECT"]);
  });

  it("nenhuma política de escrita e nenhum GRANT de tabela a anon ou authenticated (as 4 operações fechadas)", () => {
    expect(sql).not.toMatch(/CREATE POLICY [^;]* FOR (INSERT|UPDATE|DELETE|ALL)\b/i);
    expect(sql).not.toMatch(/GRANT [^;]*\bON (TABLE )?public\.product_famil[^;]*\bTO [^;]*\b(authenticated|anon)\b/i);
    expect(sql).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*\bON public\.product_famil[^;]*authenticated/i);
  });

  it("não insere dados: os únicos INSERT estão dentro de cat_guardar_familia, e o bloco final confere tabelas vazias", () => {
    const semGuardar = sql.replace(corpo("cat_guardar_familia"), "");
    expect(semGuardar).not.toMatch(/\bINSERT INTO\b/i);
    expect(contar(corpo("cat_guardar_familia"), "INSERT INTO")).toBe(3);
    expect(sql).toMatch(/SEM DADOS|v_n <> 0 THEN RAISE EXCEPTION 'Conferir: as tabelas das famílias têm %/);
  });

  it.each(FUNCOES)("%s: SECURITY DEFINER, search_path fixo e guarda de permissão no início", (f) => {
    const c = corpo(f);
    expect(c).not.toBe("");
    expect(c).toMatch(/SECURITY DEFINER SET search_path = public, pg_temp/);
    expect(c).toMatch(/fn_cat_exigir(_uma)?\(p_org, /);
    // filtra pela organização dentro da função
    expect(c).toMatch(/organization_id = p_org/);
  });

  it("leitura com products.edit ou services.view; escrita só com products.edit", () => {
    for (const f of ["cat_ler_familias", "cat_ler_familia", "cat_familias_dos_produtos"]) expect(corpo(f)).toContain("fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view'])");
    for (const f of ["cat_guardar_familia", "cat_apagar_familia"]) expect(corpo(f)).toContain("fn_cat_exigir(p_org, 'products.edit')");
  });

  it("EXECUTE tirado a PUBLIC e anon e dado só a authenticated (e service_role)", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.cat_ler_familias\(uuid\), [^;]*public\.cat_apagar_familia\(uuid,uuid\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.cat_ler_familias\(uuid\), [^;]*public\.cat_apagar_familia\(uuid,uuid\) TO authenticated, service_role;/);
  });

  it("cat_ler_familia esconde custo, PVP, grossista, distribuidor e fornecedor como cat_ler_produtos_pagina (services.view)", () => {
    const c = corpo("cat_ler_familia");
    expect(c).toContain("v_valores := public.fn_cat_pode(p_org, 'services.view');");
    expect(contar(c, "WHERE v_valores AND")).toBe(4);
    // a guarda confere que a página é a versão lida (md5) e o bloco final confere a máscara nas duas
    expect(sql).toContain("md5(v_src) <> 'bad8ab2033ba91c08f8921c80b11468f'");
  });

  it("concorrência otimista, lock por organização e um produto numa só família", () => {
    const c = corpo("cat_guardar_familia");
    expect(c).toMatch(/pg_advisory_xact_lock\(hashtextextended\('cat_familias:' \|\| p_org::text, 0\)\)/);
    expect(c).toMatch(/FOR UPDATE/);
    expect(c).toMatch(/p_versao IS DISTINCT FROM v_versao/);
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS product_family_members_produto_key ON public.product_family_members (product_id);");
    expect(sql).toMatch(/product_family_axes_uma_cor_key ON public\.product_family_axes \(family_id\) WHERE papel = 'cor'/);
  });

  it("os RAISE com % literal estão escapados (nenhum % sem parâmetro)", () => {
    for (const m of sql.matchAll(/RAISE (?:EXCEPTION|NOTICE) '((?:[^']|'')*)'([^;]*);/g)) {
      const marcas = (m[1].replace(/%%/g, "").match(/%/g) ?? []).length;
      const params = m[2].split("USING")[0].split(",").filter((x) => x.trim()).length;
      expect({ msg: m[1], marcas }).toEqual({ msg: m[1], marcas: params });
    }
  });
});
