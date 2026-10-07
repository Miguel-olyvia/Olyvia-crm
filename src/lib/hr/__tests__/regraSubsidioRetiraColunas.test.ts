/**
 * Contratos da migration 20261210180000 (retira valor_diario e modo de
 * hr_regras_subsidio_alimentacao) e a guarda estatica de que o codigo da app
 * ja nao os usa. O COMPORTAMENTO fica no bloco de conferir da migration (corre
 * no `db push`, sentinela HR900); aqui so o que nenhum compilador ve.
 *
 * O segundo grupo e a razao de este ficheiro existir: se alguem voltar a ler ou
 * gravar `valor_diario` / `modo` da regra, o codigo parte no dia em que a
 * migration for aplicada. O teste falha antes.
 */
import { describe, expect, it } from "vitest";
import { MIGRATIONS, migrationPorVersao, semComentarios } from "./migrationSql";

const VERSAO = "20261210180000";
const BRUTO = () => migrationPorVersao(VERSAO);
const SQL = () => semComentarios(BRUTO());
const normalizar = (sql: string) => sql.replace(/\s+/g, " ");

describe("20261210180000: retira valor_diario e modo", () => {
  it("o ficheiro existe, e unico e vem depois da migration que as marcou obsoletas", () => {
    const nomes = Object.keys(MIGRATIONS).map((k) => k.split("/").pop() as string);
    expect(nomes.filter((n) => n.startsWith(`${VERSAO}_`))).toHaveLength(1);
    expect(Number(VERSAO)).toBeGreaterThan(20261210170000);
  });

  it("nao ha ficheiro de reversao na pasta (so a migration, que e irreversivel)", () => {
    const nomes = Object.keys(MIGRATIONS).map((k) => k.split("/").pop() as string);
    expect(nomes.filter((n) => /rollback|revert|reverte|repoe/i.test(n) && /regra_subsidio|subsidio_alimentacao/i.test(n))).toEqual([]);
  });

  it("o cabecalho diz que o codigo ja esta no commit, o seed, e que nao e reversivel", () => {
    const bruto = BRUTO();
    expect(bruto).toContain("cdd01aac");
    expect(bruto).toContain("NAO PRECISA DE CODIGO NOVO");
    expect(bruto).toContain("20261210090000");
    expect(bruto).toContain("NAO E REVERSIVEL");
  });

  it("tem a guarda previa: tabela, colunas, idempotencia, funcoes, dependencias e constraints", () => {
    const sql = normalizar(SQL());
    const guardas = /DO \$guardas\$.*?\$guardas\$;/.exec(sql)?.[0] ?? "";
    expect(guardas).not.toBe("");
    expect(guardas).toContain("to_regclass('public.hr_regras_subsidio_alimentacao')");
    expect(guardas).toMatch(/RAISE NOTICE 'valor_diario e modo ja foram retiradas/);
    expect(guardas).toMatch(/RETURN;/);
    // funcoes do schema public (pg_proc.prosrc)
    expect(guardas).toContain("p.prosrc ILIKE '%hr_regras_subsidio_alimentacao%'");
    expect(guardas).toContain("p.prosrc ~* 'valor_diario'");
    // dependencias (pg_depend), vistas, vistas materializadas e politicas
    expect(guardas).toContain("FROM pg_depend d");
    expect(guardas).toContain("FROM pg_views");
    expect(guardas).toContain("FROM pg_matviews");
    expect(guardas).toContain("FROM pg_policies");
    expect(guardas).toMatch(/qual, ''\) \|\| ' ' \|\| coalesce\(with_check, ''\)/);
    // constraints: so CHECKs que dependam so das duas colunas
    expect(guardas).toContain("NOT (contype = 'c' AND conkey <@ v_attnums)");
    expect(guardas).toContain("confrelid = v_tabela");
  });

  it("a guarda vem antes do DROP COLUMN", () => {
    const sql = SQL();
    expect(sql.indexOf("$guardas$")).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf("$guardas$")).toBeLessThan(sql.search(/DROP COLUMN/));
  });

  it("retira as duas colunas, e so essas, sem CASCADE", () => {
    const sql = normalizar(SQL());
    expect(sql).toMatch(/DROP COLUMN IF EXISTS valor_diario/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS modo\b/);
    expect([...sql.matchAll(/DROP COLUMN/g)]).toHaveLength(2);
    expect(sql).not.toMatch(/CASCADE/i);
    expect(sql).not.toMatch(/DROP TABLE|DROP CONSTRAINT|TRUNCATE|DELETE FROM/i);
  });

  it("actualiza o COMMENT da tabela: so o tempo minimo por dia", () => {
    const sql = normalizar(SQL());
    expect(sql).toContain("COMMENT ON TABLE public.hr_regras_subsidio_alimentacao IS");
    expect(sql).toContain("Guarda so o tempo minimo por dia");
    // as colunas retiradas nao ficam com COMMENT (daria erro depois do DROP)
    expect(sql).not.toMatch(/COMMENT ON COLUMN public\.hr_regras_subsidio_alimentacao\.(valor_diario|modo)\b/);
  });

  it("acaba o conferir com a sentinela HR900 e confere colunas, constraints, grants, politicas e upsert", () => {
    const sql = normalizar(SQL());
    const conferir = /DO \$conferir\$.*?\$conferir\$;/.exec(sql)?.[0] ?? "";
    expect(conferir).toContain("USING ERRCODE = 'HR900'");
    expect(conferir).toContain("WHEN SQLSTATE 'HR900'");
    expect(conferir).toContain("created_at,created_by,id,minutos_minimos_dia,organization_id,updated_at,updated_by");
    expect(conferir).toContain("column_name IN ('valor_diario', 'modo')");
    expect(conferir).toContain("'INSERT,SELECT,UPDATE'");
    expect(conferir).toContain("grantee = 'anon'");
    expect(conferir).toContain("relrowsecurity");
    expect(conferir).toContain("hr_regras_subsidio_alimentacao_block_delete");
    expect(conferir).toContain("v_n <> 4");
    // o upsert do hook: so organization_id e minutos_minimos_dia, numa organizacao fabricada
    expect(conferir).toContain("INSERT INTO public.anew_organizations (name)");
    expect(conferir).toMatch(
      /INSERT INTO public\.hr_regras_subsidio_alimentacao \(organization_id, minutos_minimos_dia\) VALUES \(v_org, 45\) ON CONFLICT \(organization_id\) DO UPDATE/,
    );
  });

  it("o conferir nao fabrica dados fora do sub-bloco que se desfaz com a sentinela", () => {
    const conferir = /DO \$conferir\$[\s\S]*?\$conferir\$;/.exec(SQL())?.[0] ?? "";
    const insercao = conferir.indexOf("INSERT INTO public.anew_organizations");
    const sentinela = conferir.indexOf("ERRCODE = 'HR900'");
    // o primeiro BEGIN e o do DO; o segundo abre o sub-bloco que a sentinela desfaz
    const subBloco = conferir.indexOf("BEGIN", conferir.indexOf("BEGIN") + 1);
    expect(subBloco).toBeGreaterThan(0);
    expect(insercao).toBeGreaterThan(subBloco);
    expect(insercao).toBeLessThan(sentinela);
  });

  it("nao desliga triggers nem toca em grants, politicas ou RLS", () => {
    const sql = SQL();
    expect(sql).not.toMatch(/DISABLE\s+TRIGGER/i);
    expect(sql).not.toMatch(/session_replication_role/i);
    expect(sql).not.toMatch(/^\s*(GRANT|REVOKE|CREATE POLICY|DROP POLICY|ALTER POLICY)\b/m);
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  it("os ficheiros usam CRLF: todas as linhas acabam em 0x0D 0x0A", () => {
    const bruto = BRUTO();
    const linhas = bruto.split("\n").length - 1;
    const retornos = [...bruto].filter((c) => c === "\r").length;
    expect(linhas).toBeGreaterThan(100);
    expect(retornos).toBe(linhas);
  });

  it("RAISE: cada mensagem tem tantos argumentos como % (e nenhum % solto)", () => {
    const sql = SQL();
    const raises = [...sql.matchAll(/RAISE (?:EXCEPTION|NOTICE) '((?:[^']|'')*)'((?:[^;]|\n)*?);/g)];
    expect(raises.length).toBeGreaterThan(10);
    for (const [, mensagem, resto] of raises) {
      const marcadores = (mensagem.replace(/%%/g, "").match(/%/g) ?? []).length;
      const semUsing = resto.split(/\bUSING\b/)[0];
      // argumentos: virgulas ao nivel zero de parenteses
      let nivel = 0;
      let argumentos = 0;
      let emTexto = false;
      for (const c of semUsing) {
        if (c === "'") emTexto = !emTexto;
        if (emTexto) continue;
        if (c === "(") nivel += 1;
        else if (c === ")") nivel -= 1;
        else if (c === "," && nivel === 0) argumentos += 1;
      }
      expect(argumentos, `RAISE "${mensagem.slice(0, 60)}..."`).toBe(marcadores);
    }
  });
});

// ---------------------------------------------------------------------------
// Guarda estatica: nada em src le ou escreve valor_diario / modo da regra.
// ---------------------------------------------------------------------------
const FICHEIROS_SRC = import.meta.glob(
  [
    "../../../**/*.{ts,tsx}",
    "!../../../**/__tests__/**",
    "!../../../**/*.test.{ts,tsx}",
    "!../../../translations/**",
    "!../../../integrations/supabase/types.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

/** Tira comentarios de bloco e de linha: so o codigo conta. */
function semComentariosTs(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`])\/\/.*$/gm, "$1");
}

describe("src: a regra do subsidio so usa minutos_minimos_dia", () => {
  it("o glob apanhou o codigo (e nao um conjunto vazio)", () => {
    const nomes = Object.keys(FICHEIROS_SRC);
    expect(nomes.length).toBeGreaterThan(100);
    expect(nomes.some((n) => n.endsWith("/hooks/useRegrasSubsidioAlimentacao.ts"))).toBe(true);
    expect(nomes.some((n) => n.includes("__tests__"))).toBe(false);
  });

  it("nenhum ficheiro refere valor_diario no codigo", () => {
    const culpados = Object.entries(FICHEIROS_SRC)
      .filter(([, codigo]) => /\bvalor_diario\b/.test(semComentariosTs(codigo)))
      .map(([nome]) => nome);
    expect(culpados).toEqual([]);
  });

  it("nenhum ficheiro que usa a regra do subsidio refere 'modo' dela", () => {
    const RELACIONADO = /hr_regras_subsidio_alimentacao|HrRegraSubsidioAlimentacao|useRegrasSubsidioAlimentacao|RegraSubsidioAlimentacaoPatch/;
    // `regra.modo`, `regra?.modo` e a palavra "modo" sozinha dentro de uma string
    // (select/upsert). O "modo" de um parametro ou o modo_calculo dos codigos nao conta.
    const PROPRIEDADE = /\bregra\w*\??\.modo(?![-\w])/;
    const EM_STRING = /["'`][^"'`\n]*(?<![-\w.{])modo(?![-\w}])[^"'`\n]*["'`]/;
    const culpados = Object.entries(FICHEIROS_SRC)
      .filter(([, codigo]) => {
        const limpo = semComentariosTs(codigo);
        return RELACIONADO.test(limpo) && (PROPRIEDADE.test(limpo) || EM_STRING.test(limpo));
      })
      .map(([nome]) => nome);
    expect(culpados).toEqual([]);
  });

  it("o tipo HrRegraSubsidioAlimentacao nao tem valor_diario nem modo", () => {
    const tipos = Object.entries(FICHEIROS_SRC).find(([n]) => n.endsWith("/types/hr.ts"))?.[1] ?? "";
    const corpo = /export interface HrRegraSubsidioAlimentacao \{([\s\S]*?)\n\}/.exec(tipos)?.[1] ?? "";
    expect(corpo).toContain("minutos_minimos_dia: number;");
    expect(corpo).not.toMatch(/\bmodo\b|valor_diario/);
  });

  it("o hook so pede e grava minutos_minimos_dia (alem de ids e carimbos)", () => {
    const hook = Object.entries(FICHEIROS_SRC).find(([n]) => n.endsWith("/hooks/useRegrasSubsidioAlimentacao.ts"))?.[1] ?? "";
    const limpo = semComentariosTs(hook);
    expect(limpo).toContain('"id, organization_id, minutos_minimos_dia, created_at, updated_at"');
    expect(limpo).toContain("minutos_minimos_dia: patch.minutosMinimosDia");
    expect(limpo).not.toMatch(/\bmodo\b|valor_diario/);
  });
});
