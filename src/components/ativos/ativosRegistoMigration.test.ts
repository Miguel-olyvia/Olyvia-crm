/**
 * @vitest-environment node
 */
// 25/11: a migration da fase 1 dos ATIVOS (20270126500000) lida como TEXTO. Confere o que se pode conferir sem a correr:
// CRLF, cabeçalho (só base de RH, entra junto com o ecrã), uma só transacção com lock_timeout, RLS forçada nas duas
// tabelas, nenhum direito de tabela para anon/authenticated, nenhuma política de DELETE, as permissões novas ativos.*
// concedidas só no ARRAY dos papéis globais (nunca assets.*), as RPCs SECURITY DEFINER com search_path vazio, os códigos
// ATV02..ATV18 e os RAISE com % escapado. Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270126500000_ativos_registo.sql";
const caminho = resolve(pasta, nome);
const bytes = existsSync(caminho) ? readFileSync(caminho) : Buffer.alloc(0);
const bruto = bytes.toString("utf8");
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

const RPCS = [
  "rpc_ativos_listar",
  "rpc_ativo_ler",
  "rpc_ativo_criar",
  "rpc_ativo_alterar",
  "rpc_ativo_desativar",
  "rpc_ativo_reativar",
  "rpc_ativo_ligar_pessoa",
  "rpc_ativo_desligar_pessoa",
  "rpc_ativos_opcoes",
];
const INTERNAS = ["ativos_exigir", "ativos_validar", "ativos_json", "ativos_evento", "ativo_eventos_imutavel"];

/** O corpo de uma função: de CREATE FUNCTION public.<nome>( até ao $$; que a fecha. */
function corpo(fn: string): string {
  const i = sql.indexOf(`CREATE FUNCTION public.${fn}(`);
  if (i < 0) return "";
  const fim = sql.indexOf("$$;", sql.indexOf("AS $$", i));
  return sql.slice(i, fim + 3);
}

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
    expect(lf).toBeGreaterThan(100);
    expect(crlf).toBe(lf);
  });

  it("cabeçalho: só base de RH e entra junto com o ecrã /ativos", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain("ENTRA JUNTO COM O ECRÃ /ativos");
    expect(bruto).toContain("supabase migration list --linked");
  });

  it("uma só transacção, com lock_timeout logo no início", () => {
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
    expect(sql).toMatch(/BEGIN; SET LOCAL lock_timeout = '5s';/);
  });

  it("RLS ligada e forçada nas duas tabelas, sem direitos de tabela e sem política de DELETE", () => {
    for (const t of ["ativo", "ativo_eventos"]) {
      expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`ALTER TABLE public.${t} FORCE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`REVOKE ALL ON TABLE public.${t} FROM PUBLIC, anon, authenticated, service_role;`);
    }
    expect(sql).toContain("REVOKE ALL ON SEQUENCE public.ativo_eventos_id_seq FROM PUBLIC, anon, authenticated, service_role;");
    expect(sql).not.toMatch(/GRANT [^;]* ON (TABLE )?public\.(ativo|ativo_eventos|pessoas_equipamentos)\b[^;]*;/i);
    const politicas = [...sql.matchAll(/CREATE POLICY (\w+) ON public\.(\w+) FOR (\w+)/g)].map((m) => `${m[2]}:${m[3]}`);
    expect(politicas.sort()).toEqual(["ativo:INSERT", "ativo:SELECT", "ativo:UPDATE", "ativo_eventos:SELECT"]);
    expect(sql).not.toMatch(/CREATE POLICY [^;]* FOR (DELETE|ALL)\b/);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/\bDROP (TABLE|FUNCTION|POLICY|INDEX)\b/i);
  });

  it("ligação ao catálogo da mesma organização, uma pessoa de cada vez, vida 1..600 e residual <= compra", () => {
    expect(sql).toContain(
      "FOREIGN KEY (cat_equipamento_id, organization_id) REFERENCES public.cat_equipamentos (id, organization_id) ON DELETE RESTRICT",
    );
    expect(sql).toContain("CHECK ((grupo = 'servico') = (cat_equipamento_id IS NOT NULL))");
    expect(sql).toContain(
      "FOREIGN KEY (ativo_id, organization_id) REFERENCES public.ativo (id, organization_id) ON DELETE RESTRICT",
    );
    expect(sql).toContain(
      "CREATE UNIQUE INDEX pessoas_equipamentos_ativo_atribuido_key ON public.pessoas_equipamentos (ativo_id) WHERE ativo_id IS NOT NULL AND estado = 'atribuido';",
    );
    expect(sql).toContain("vida_meses BETWEEN 1 AND 600");
    expect(sql).toContain("valor_residual >= 0 AND valor_residual <= valor_compra");
    expect(sql).toContain("ALTER TABLE public.pessoas_equipamentos ADD COLUMN ativo_id uuid;");
    // não se preenche nada no RH
    expect(sql).not.toMatch(/UPDATE public\.pessoas_equipamentos [^;]*SET ativo_id = (?!p_ativo_id|NULL)/);
  });

  it("auditoria só de acrescentar (trigger recusa UPDATE, DELETE e TRUNCATE)", () => {
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.ativo_eventos");
    expect(sql).toContain("BEFORE TRUNCATE ON public.ativo_eventos");
  });

  it("permissões NOVAS ativos.view/ativos.edit, concedidas só no ARRAY dos papéis globais; nunca assets.*", () => {
    expect(sql).toMatch(/\('ativos\.view', 'Ativos: ver o registo e os valores',/);
    expect(sql).toMatch(/\('ativos\.edit', 'Ativos: criar, editar e desativar',/);
    expect(sql).toContain("ON CONFLICT (code) DO NOTHING;");
    expect(sql).toContain("FOREACH v_papel IN ARRAY ARRAY['super_admin', 'system_admin'] LOOP");
    expect(sql).toContain("r.is_system = true AND r.organization_id IS NULL");
    expect(sql).toContain("ON CONFLICT (role_id, permission_code) DO NOTHING;");
    // uma só escrita em anew_role_permissions, e é a do ARRAY
    expect(sql.match(/INSERT INTO public\.anew_role_permissions/g)).toHaveLength(1);
    // a claim de service_role é LOCAL e reposta
    expect(sql).toContain(`PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);`);
    expect(sql).toMatch(/PERFORM set_config\('request\.jwt\.claims', CASE WHEN coalesce\(v_prev_claim, ''\) = '' THEN '\{\}' ELSE v_prev_claim END, true\);/);
    // nenhuma permissão assets.* é usada ou concedida
    expect(sql).not.toMatch(/'assets\.\w+'/);
    // conferência das 4 linhas exactas
    expect(sql).toMatch(/IF v_n <> 4 OR v_global <> 4 OR v_dist <> 4 THEN/);
  });

  it("as RPCs são SECURITY DEFINER com search_path vazio, exigem a permissão nova e só authenticated as executa", () => {
    for (const fn of RPCS) {
      const c = corpo(fn);
      expect(c, fn).not.toBe("");
      expect(c, fn).toContain("SECURITY DEFINER SET search_path = ''");
      expect(c, fn).toMatch(/public\.ativos_exigir\(p_organization_id, 'ativos\.(view|edit)'\)/);
      expect(sql, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, service_role;`));
      expect(sql, fn).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated;`));
    }
    for (const fn of INTERNAS) {
      expect(sql, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated, service_role;`));
      expect(sql, fn).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(`));
    }
    expect(sql).not.toMatch(/TO anon\b/);
    // ligar e desligar exigem também a edição do RH
    for (const fn of ["rpc_ativo_ligar_pessoa", "rpc_ativo_desligar_pessoa"]) {
      expect(corpo(fn)).toContain("public.ativos_exigir(p_organization_id, 'hr.pessoas.retribuicao.edit')");
    }
    // o nome de quem tem o equipamento só com a permissão de leitura do RH
    expect(corpo("rpc_ativos_listar")).toContain("'hr.pessoas.retribuicao.view'");
    expect(corpo("rpc_ativos_listar")).toMatch(/'atribuicao', CASE WHEN v_rh AND/);
    expect(corpo("rpc_ativos_listar")).toMatch(/IF v_rh THEN/);
  });

  it("os códigos de erro ATV02..ATV18 existem todos, com P0001 e texto em pt-PT", () => {
    for (let n = 2; n <= 18; n++) {
      const codigo = `ATV${String(n).padStart(2, "0")}`;
      expect(sql, codigo).toMatch(new RegExp(`RAISE EXCEPTION '${codigo}' USING ERRCODE = 'P0001', DETAIL = '[^']+'`));
    }
    expect(corpo("rpc_ativo_desativar")).toContain("Devolva-o primeiro no RH.");
    expect(sql).toContain("Escolha o equipamento do catálogo a que esta máquina corresponde.");
  });

  it("os RAISE com % literal estão escapados (nenhum % sem parâmetro)", () => {
    const raises = [...sql.matchAll(/RAISE (?:EXCEPTION|NOTICE|WARNING) '((?:[^']|'')*)'([^;]*);/g)];
    expect(raises.length).toBeGreaterThan(30);
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

  it("guardas antes e conferência depois; catálogo lido com ::text", () => {
    for (const g of ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9"]) expect(sql).toContain(`RAISE EXCEPTION '${g}:`);
    for (const c of ["C1", "C2", "C3", "C4", "C5", "C6"]) expect(sql).toContain(`RAISE EXCEPTION '${c}:`);
    expect(sql).toContain("c.contype::text = 'u'");
    expect(sql).not.toMatch(/CREATE (UNIQUE )?(TABLE|INDEX|POLICY) IF NOT EXISTS|ADD COLUMN IF NOT EXISTS|CREATE OR REPLACE FUNCTION/);
    expect(sql).not.toMatch(/to_jsonb\((a|r|v|v_a|v_atual|s\.r)\)/);
  });

  it("nenhuma migration de reversão desta e nenhum carimbo repetido", () => {
    expect(readdirSync(pasta).filter((f) => /ativos?_/.test(f) && /ativo/.test(f))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270126500000_"))).toHaveLength(1);
  });
});
