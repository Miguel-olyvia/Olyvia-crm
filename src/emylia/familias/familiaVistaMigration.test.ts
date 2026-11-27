/**
 * @vitest-environment node
 */
// 26/11: a migration da leitura da vista de família com 3D (20270129300000), lida como TEXTO. Confere o que se pode conferir sem a correr:
// uma só função, STABLE SECURITY DEFINER com search_path vazio, EXECUTE só para authenticated, o corpo só lê (nenhuma escrita, nenhum custo,
// nenhuma consulta ao catálogo do Postgres), a porta e as máscaras do PVP e do stock, os campos devolvidos, as guardas e conferências finais
// e os RAISE com tantos % como argumentos. Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270129300000_cat_ler_familia_vista.sql";
const caminho = resolve(pasta, nome);
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");
/** O corpo da função (entre «AS $$» e «END $$;»), sem comentários. */
const corpo = (() => {
  const i = sql.indexOf("AS $$"), j = sql.indexOf("END $$;");
  return i < 0 || j < 0 ? "" : sql.slice(i + 5, j);
})();
const FUNCAO = "public.cat_ler_familia_vista(uuid,uuid)";

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz a base, que não escreve, o código que entra junto, a ordem e a reversão", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain("NÃO ESCREVE NADA");
    expect(bruto).toContain("MIGRATION E CÓDIGO ENTRAM JUNTOS");
    expect(bruto).toContain("depois de 20270129100000");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("db push --dry-run tem de listar SÓ");
    expect(bruto).toContain("REVERSÃO: fora da pasta das migrations");
  });

  it("cria uma só função, STABLE SECURITY DEFINER, plpgsql, com search_path vazio", () => {
    expect(sql.match(/CREATE (OR REPLACE )?FUNCTION/g)).toHaveLength(1);
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.cat_ler_familia_vista(p_org uuid, p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$",
    );
    expect(sql).not.toMatch(/\bVOLATILE\b/);
  });

  it("EXECUTE só para authenticated: revoga de PUBLIC, anon e service_role (privilégios por omissão) e não concede a mais ninguém", () => {
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${FUNCAO} FROM PUBLIC, anon, authenticated, service_role;`);
    const grants = [...sql.matchAll(/GRANT ([^;]*);/g)].map((m) => m[1]);
    expect(grants).toEqual([`EXECUTE ON FUNCTION ${FUNCAO} TO authenticated`]);
    expect(sql.indexOf("REVOKE ALL ON FUNCTION")).toBeLessThan(sql.indexOf("GRANT EXECUTE"));
  });

  it("fora da função só há guardas, a função, permissões, o comentário e conferências: nenhuma tabela nem dado muda", () => {
    // sem o corpo e sem os textos entre plicas (as expressões regulares das conferências citam estas palavras)
    const fora = sql.replace(corpo, " ").replace(/'(?:[^']|'')*'/g, "''");
    expect(fora).not.toMatch(/\b(INSERT INTO|DELETE FROM|TRUNCATE|ALTER TABLE|DROP|CREATE (TABLE|INDEX|UNIQUE|POLICY|TRIGGER|VIEW))\b/i);
    expect(fora).not.toMatch(/\bUPDATE\s+(public\.)?\w+\s+(\w+\s+)?SET\b/i);
    expect(fora).not.toMatch(/\bBEGIN;|\bCOMMIT;/);
  });

  it("o corpo só lê: nenhuma escrita, nenhum custo nem fornecedor, nenhuma consulta ao catálogo do Postgres", () => {
    expect(corpo.length).toBeGreaterThan(1000);
    expect(corpo).not.toMatch(/\b(insert|update|delete|truncate|merge|copy|grant|revoke|alter|drop|create)\b/i);
    expect(corpo).not.toMatch(/purchase|wholesale|distributor|average_cost|item_suppliers|fornecedor/i);
    expect(corpo).not.toMatch(/\bpg_\w+|information_schema|::reg\w+/i);
  });

  it("com search_path vazio, todas as tabelas e funções do projeto vêm com o esquema", () => {
    const tabelas = [...corpo.matchAll(/\b(?:FROM|JOIN)\s+(?!LATERAL\b)([\w.]+)/gi)].map((m) => m[1]);
    const ctes = new Set(["eixo", "aplic", "prod", "modelo", "fam"]);
    expect(tabelas.length).toBeGreaterThan(15);
    for (const t of tabelas) expect(t.startsWith("public.") || ctes.has(t), t).toBe(true);
    const chamadas = [...corpo.matchAll(/\b(fn_cat_\w+|has_anew_\w+|get_user_\w+)\(/g)];
    expect(chamadas.length).toBeGreaterThan(5);
    for (const m of chamadas) expect(corpo.slice(m.index! - 7, m.index), m[1]).toBe("public.");
    expect(corpo).toContain("auth.uid()");
  });

  it("a porta é a de cat_ler_familia, o PVP só com services.view e o stock só com a leitura de stocks_select_policy", () => {
    expect(corpo).toContain("PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);");
    expect(corpo.indexOf("fn_cat_exigir_uma")).toBeLessThan(corpo.indexOf("FROM public.product_families"));
    expect(corpo).toContain("RAISE EXCEPTION 'Família não encontrada.' USING ERRCODE = 'CT003';");
    expect(corpo).toContain("v_valores := public.fn_cat_pode(p_org, 'services.view');");
    expect(corpo).toContain("WHERE v_valores AND pp.product_id = p.id AND pp.price_type = 'retail'");
    expect(corpo.match(/public\.product_prices/g)).toHaveLength(1);
    expect(corpo).toContain(
      "v_stock := v_uid IS NOT NULL AND p_org IN (SELECT public.get_user_visible_org_ids(v_uid)) AND public.has_anew_permission_for_org(v_uid, 'inventory.view', p_org);",
    );
    expect(corpo).toContain("WHERE v_stock AND sk.product_id = p.id AND sk.organization_id = p_org AND sk.deleted_at IS NULL HAVING v_stock");
    expect(corpo).toContain("JOIN public.warehouses w ON w.id = sk.warehouse_id AND w.organization_id = p_org AND w.deleted_at IS NULL");
  });

  it("só a organização pedida: família, membros, produtos, atributos e outras medidas filtrados por p_org", () => {
    expect(corpo).toContain("WHERE f.id = p_id AND f.organization_id = p_org");
    expect(corpo.match(/m\.organization_id = p_org/g)!.length).toBeGreaterThanOrEqual(4);
    expect(corpo.match(/p\.organization_id = p_org AND p\.tipo_catalogo = 'produto' AND NOT p\.is_deleted/g)!.length).toBeGreaterThanOrEqual(4);
    expect(corpo).toContain("JOIN public.product_families f ON f.id = x.family_id AND f.organization_id = p_org");
  });

  it("as opções resolvem-se pelo grupo do atributo, e devolvem valor, nome, hex, foto, sigla, ordem e metal", () => {
    expect(corpo).toContain("public.fn_cat_grupo_do_atributo(a.id, p_org)");
    expect(corpo).toContain("o.group_id = e.grupo AND o.value_text = v.value_text AND o.is_active");
    for (const k of ["'valor'", "'nome'", "'hex'", "'foto'", "'sigla'", "'ordem'", "'is_metal'"]) expect(corpo).toContain(k);
  });

  it("devolve todos os campos do desenho", () => {
    for (const k of [
      "'familia'", "'ve_valores'", "'ve_stock'", "'eixos'", "'produtos'", "'modelos'", "'outras_medidas'",
      "'attribute_id'", "'code'", "'rotulo'", "'papel'", "'posicao'", "'is_measurement'",
      "'id'", "'sku'", "'estado'", "'pvp'", "'stock'", "'modelo_id'", "'modelo'", "'subcategoria_id'", "'subcategoria'",
      "'categoria_id'", "'categoria'", "'medida'", "'aplicacao'", "'valores'", "'atual'", "'medida_valor'", "'unidade'", "'texto'",
    ]) expect(corpo, k).toContain(k);
    expect(corpo).toContain("a.code::text = 'aplicacao'");
  });

  it("guardas antes da função e conferências depois (uma versão, search_path, EXECUTE, só leitura, nenhuma tabela mudou)", () => {
    const funcao = sql.indexOf("CREATE OR REPLACE FUNCTION");
    expect(sql.indexOf("já existe outra assinatura com este nome")).toBeLessThan(funcao);
    expect(sql.indexOf("PERFORM set_config('cat_vista.h_tabelas', v_h, false);")).toBeLessThan(funcao);
    for (const c of [
      "há mais do que uma versão",
      "não é STABLE SECURITY DEFINER com o search_path vazio",
      "não é só para authenticated",
      "tem uma instrução que escreve",
      "lê custos ou fornecedores",
      "falta a porta, a máscara do PVP ou a conferência do stock",
      "uma tabela, coluna, privilégio ou política do esquema public mudou",
    ]) expect(sql.indexOf(c), c).toBeGreaterThan(funcao);
    // as conferências de catálogo comparam colunas "char" por ::text
    expect(sql).toContain("c.relkind::text IN ('r', 'p', 'v', 'm')");
    expect(sql).toContain("pl.polcmd::text");
    expect(sql).toContain("p.provolatile::text = 's'");
    expect(sql).toContain("has_function_privilege('anon', c_f, 'EXECUTE') OR has_function_privilege('service_role', c_f, 'EXECUTE')");
    // a impressão digital é a mesma expressão antes e depois
    expect(sql.match(/SELECT md5\( coalesce\(\(SELECT string_agg\(c\.oid::text/g)).toHaveLength(2);
  });

  it("os RAISE com % têm tantos argumentos como %", () => {
    const raises = [...sql.matchAll(/RAISE (?:EXCEPTION|NOTICE|WARNING) '((?:[^']|'')*)'([^;]*);/g)];
    expect(raises.length).toBeGreaterThan(8);
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

  it("carimbo único, depois da última aplicada, e nenhuma reversão na pasta", () => {
    const ficheiros = readdirSync(pasta);
    expect(ficheiros.filter((f) => f.startsWith("20270129300000_"))).toEqual([nome]);
    expect(nome.slice(0, 14) > "20270129100000").toBe(true);
    expect(ficheiros.filter((f) => /familia_vista/.test(f))).toEqual([nome]);
  });
});
