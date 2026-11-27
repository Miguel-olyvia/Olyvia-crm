/**
 * @vitest-environment node
 */
// 27/11: a migration F1.0 dos ATIVOS (20270130100000, código por ORGANIZAÇÃO) lida como TEXTO, antes de qualquer push.
// Confere o que se pode conferir sem a correr: CRLF, cabeçalho (só base de RH, o que o ecrã tem de fazer), uma só
// transação, a mesma assinatura de ativos_proximo_codigo (sem DROP), o contador e a unicidade só da própria
// organização (sem grupo nem hierarquia), o prefixo da organização, o mapa CAT-TIPO, a permissão antes de escrever,
// o merge do metadata, o ATV34, os direitos e as guardas. Erros de tipo do SQL só se apanham a correr: as guardas
// G1..G5 e C1..C4 fazem-no dentro da transação.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270130100000_ativos_codigo_org.sql";
const caminho = resolve(pasta, nome);
const bytes = existsSync(caminho) ? readFileSync(caminho) : Buffer.alloc(0);
const bruto = bytes.toString("utf8");
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

/** O corpo de uma função: de CREATE [OR REPLACE] FUNCTION public.<nome>( até ao $$; que a fecha. */
function corpo(fn: string): string {
  const m = new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${fn}\\(`).exec(sql);
  if (!m) return "";
  const fim = sql.indexOf("$$;", sql.indexOf("AS $$", m.index));
  return sql.slice(m.index, fim + 3);
}

const FASE1 = [
  "20270130100000_ativos_codigo_org.sql",
  "20270130200000_ativos_por_devolver.sql",
  "20270130300000_ativos_termos.sql",
  "20270130400000_hr_vinculo_terminar_por_devolver.sql",
];

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF em todas as linhas (contado por bytes 0x0D)", () => {
    expect(bytes.length).toBeGreaterThan(0);
    let lf = 0;
    let crlf = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x0a) {
        lf++;
        if (i > 0 && bytes[i - 1] === 0x0d) crlf++;
      }
    }
    expect(lf).toBeGreaterThan(200);
    expect(crlf).toBe(lf);
  });

  it("carimbo depois de 20270130000000 (onda 7, a última no remoto) e único; sem ficheiros de reversão", () => {
    expect(nome.slice(0, 14) > "20270130000000").toBe(true);
    const outras = readdirSync(pasta).filter((f) => /^\d{14}_/.test(f) && !FASE1.includes(f));
    for (const f of outras) expect(f.slice(0, 14) < nome.slice(0, 14), f).toBe(true);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270130100000_"))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => /ativo/.test(f) && /(revert|reverter|rollback|desfazer)/i.test(f))).toEqual([]);
  });

  it("cabeçalho: base de RH, o que o ecrã tem de fazer, ordem de aplicação e o erro novo", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain("O QUE O ECRÃ TEM DE FAZER");
    expect(bruto).toContain("src/components/ativos/lib/errosAtivo.ts");
    expect(bruto).toContain("ativos.erro.ATV34");
    expect(bruto).toContain("ORDEM DE APLICAÇÃO");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("ERROS NOVOS: ATV34");
  });

  it("uma só transação, com lock_timeout logo no início", () => {
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
    expect(sql).toMatch(/BEGIN; SET LOCAL lock_timeout = '5s';/);
  });

  it("só funções: sem tabelas, colunas, CHECKs, índices, gatilhos, cron nem notificações", () => {
    expect(sql).not.toMatch(/\b(CREATE|ALTER|DROP) (TABLE|INDEX|TRIGGER|POLICY)\b/i);
    expect(sql).not.toMatch(/ADD (COLUMN|CONSTRAINT)/i);
    expect(sql).not.toMatch(/DROP FUNCTION/i);
    expect(sql).not.toMatch(/cron\.|notifications/i);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
  });

  it("ativos_proximo_codigo: mesma assinatura, contador e unicidade só da própria organização, sem grupo", () => {
    const c = corpo("ativos_proximo_codigo");
    expect(c).toContain("CREATE OR REPLACE FUNCTION public.ativos_proximo_codigo(p_org uuid, p_grupo text, p_tipo text) RETURNS text");
    expect(c).not.toContain("SECURITY DEFINER");
    expect(c).toContain("SET search_path = ''");
    expect(c).toContain("v_pref text := public.ativos_prefixo_org(p_org);");
    expect(c).toContain("v_meio text := public.ativos_cat_tipo(p_grupo, p_tipo);");
    expect(c).toContain("v_aa text := to_char(public.ativos_hoje(), 'YY');");
    expect(c).toContain("VALUES (p_org, v_pref, 1)");
    expect(c).toContain("ON CONFLICT (organization_id, prefixo) DO UPDATE SET ultimo = c.ultimo + 1");
    expect(c).toContain("v_cod := v_pref || '-' || v_meio || '-' || v_aa || '-' || CASE WHEN v_n < 10000 THEN lpad(v_n::text, 4, '0') ELSE v_n::text END;");
    expect(c).toContain("WHERE a.organization_id = p_org AND a.codigo IS NOT NULL AND lower(a.codigo) = lower(v_cod)");
    expect(c).toContain("RAISE EXCEPTION 'ATV32'");
    expect(c).not.toContain("public.ativos_prefixo(");
    // decisão do dono: por organização, sem grupo, raiz nem hierarquia
    expect(sql).not.toMatch(/anew_hierarchy|raiz|grupo_empresas/i);
  });

  it("ativos_prefixo_org: o prefixo da PRÓPRIA organização, senão 4 letras do nome sem acentos, senão ATV", () => {
    const c = corpo("ativos_prefixo_org");
    expect(c).toContain("RETURNS text LANGUAGE sql STABLE SET search_path = ''");
    expect(c).toContain("upper(btrim(o.metadata ->> 'ativos_prefixo_codigo'))");
    expect(c).toContain("btrim(o.metadata ->> 'ativos_prefixo_codigo') ~ '^[A-Za-z]{2,4}$'");
    expect(c.match(/WHERE o\.id = p_org/g)).toHaveLength(2);
    expect(c).toContain("translate(o.name,");
    expect(c).toContain("'[^A-Za-z]', '', 'g'), 4))");
    expect(c).toContain("length(x.l) >= 2");
    expect(c).toContain("'ATV')");
  });

  it("ativos_cat_tipo: o mapa CAT-TIPO do plano", () => {
    const c = corpo("ativos_cat_tipo");
    expect(c).toContain("IMMUTABLE");
    for (const par of [
      "WHEN p_grupo = 'servico' THEN 'MAQ-EQP'",
      "WHEN 'portatil' THEN 'IT-LAP'",
      "WHEN 'telemovel' THEN 'TEL-TLM'",
      "WHEN 'viatura' THEN 'VIA-VIA'",
      "WHEN 'ferramentas' THEN 'FER-FER' ELSE 'OUT-OUT' END",
      "WHEN 'eletronica' THEN 'IT-ELE'",
      "WHEN 'instalacoes' THEN 'EST-INS'",
      "WHEN 'mobiliario' THEN 'EST-MOB' ELSE 'EST-OUT' END",
    ]) {
      expect(c, par).toContain(par);
    }
  });

  it("rpc_ativos_prefixo_definir: permissão ANTES de tudo, ATV34, merge no metadata (nunca o substitui)", () => {
    const c = corpo("rpc_ativos_prefixo_definir");
    const perm = c.indexOf("PERFORM public.ativos_exigir(p_organization_id, 'ativos.edit');");
    expect(perm).toBeGreaterThan(0);
    expect(c.indexOf("RAISE EXCEPTION 'ATV34'")).toBeGreaterThan(perm);
    expect(c.indexOf("UPDATE public.anew_organizations o")).toBeGreaterThan(perm);
    expect(c).toContain("btrim(p_prefixo) !~ '^[A-Za-z]{2,4}$'");
    expect(c).toContain("v_pref := upper(btrim(p_prefixo));");
    expect(c).toContain("SET metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object('ativos_prefixo_codigo', v_pref)");
    expect(c).toContain("WHERE o.id = p_organization_id");
    expect(c).toContain("'organization_id', p_organization_id, 'prefixo', v_pref, 'exemplo',");
  });

  it("direitos: rpc SECURITY DEFINER só para authenticated; internas para ninguém; nada para anon", () => {
    const rpc = corpo("rpc_ativos_prefixo_definir");
    expect(rpc).toContain("SECURITY DEFINER SET search_path = ''");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.rpc_ativos_prefixo_definir(uuid, text) FROM PUBLIC, anon, service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.rpc_ativos_prefixo_definir(uuid, text) TO authenticated;");
    for (const [fn, sig] of [
      ["ativos_prefixo_org", "uuid"],
      ["ativos_cat_tipo", "text, text"],
      ["ativos_proximo_codigo", "uuid, text, text"],
    ]) {
      expect(corpo(fn), fn).not.toContain("SECURITY DEFINER");
      expect(sql, fn).toContain(`REVOKE ALL ON FUNCTION public.${fn}(${sig}) FROM PUBLIC, anon, authenticated, service_role;`);
      expect(sql, fn).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(`));
    }
    expect(sql).not.toMatch(/TO anon\b/);
  });

  it("o código de erro novo ATV34 existe, com P0001 e texto em pt-PT", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'ATV34' USING ERRCODE = 'P0001', DETAIL = '[^']+'/);
    expect(sql).not.toMatch(/'ATV3[5-9]'/);
  });

  it("os RAISE com % têm tantos argumentos como marcas", () => {
    const raises = [...sql.matchAll(/RAISE (?:EXCEPTION|NOTICE|WARNING) '((?:[^']|'')*)'([^;]*);/g)];
    expect(raises.length).toBeGreaterThan(10);
    for (const m of raises) {
      const marcas = (m[1].replace(/%%/g, "").match(/%/g) ?? []).length;
      let nivel = 0;
      const partes = [""];
      for (const ch of m[2].split("USING")[0]) {
        if (ch === "(") nivel++;
        if (ch === ")") nivel--;
        if (ch === "," && nivel === 0) partes.push("");
        else partes[partes.length - 1] += ch;
      }
      const params = partes.filter((x) => x.trim()).length;
      expect({ msg: m[1], marcas }).toEqual({ msg: m[1], marcas: params });
    }
  });

  it("guardas antes e conferência depois; md5 lido a 27/11; catálogo lido com ::text", () => {
    for (const g of ["G1", "G2", "G3", "G4", "G5"]) expect(sql).toContain(`RAISE EXCEPTION '${g}:`);
    for (const c of ["C1", "C2", "C3", "C4"]) expect(sql).toContain(`RAISE EXCEPTION '${c}:`);
    expect(sql).toContain("md5(p.prosrc::text) = '09e818fee62a2977863749dfecbcdbc1'");
    expect(sql).toContain("pg_get_function_identity_arguments(p.oid)::text = 'p_org uuid, p_grupo text, p_tipo text'");
    expect(sql).toContain("md5(pg_get_constraintdef(c.oid)::text) = '847c5482e04d2258ab1b1640e92f1c57'");
    expect(sql).toContain("c.contype::text = 'c'");
    expect(sql).toContain("p.prosrc ~ 'ATV34'");
    expect(sql).not.toMatch(/\|\| *c\.contype|\|\| *contype/);
    expect(sql).toContain("public.ativos_prefixo_org('b6ffce4f-f630-4933-833a-008649757a33') <> 'NIKE'");
  });
});
