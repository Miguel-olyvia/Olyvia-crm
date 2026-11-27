/**
 * @vitest-environment node
 */
// 27/11: a migration «modelo 3D por Modelo» (20270130360000) lida como TEXTO. Confere o que se pode conferir sem a correr: o cabeçalho (só base de
// RH, o que a página de Modelos tem de fazer), a coluna e o CHECK em product_models, o ramo 'modelo' de cat_definir_modelo_3d (organização,
// apagado recusado, products.edit, a mesma chave de lock de cat_estado_modelo), a chave 'modelo3d' em cat_ler_modelos_gestao, os privilégios, as
// guardas por md5 e os RAISE com % passado como argumento. Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const caminho = resolve(process.cwd(), "supabase/migrations/20270130360000_catalogo_modelo_3d_por_modelo.sql");
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");
const contar = (texto: string, agulha: string): number => texto.split(agulha).length - 1;

/** O corpo de uma função criada na migration (de CREATE … até END $function$). */
function corpo(nome: string): string {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
  if (i < 0) return "";
  const f = sql.indexOf("END $function$", i);
  return f < 0 ? "" : sql.slice(i, f);
}

describe("migration 20270130360000_catalogo_modelo_3d_por_modelo.sql", () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz que é só da base de RH e o que a página de Modelos tem de fazer", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toMatch(/PRECISA DE CÓDIGO NOVO/);
    for (const s of ["GestaoModelos.tsx", "modelosDados.ts", "modelo3dDados.ts", "p_alvo = 'modelo'"]) expect(bruto).toContain(s);
  });

  it("acrescenta product_models.modelo_3d text NULL com o mesmo CHECK das categorias, sem default e sem mexer em dados", () => {
    expect(sql).toMatch(/ALTER TABLE public\.product_models ADD COLUMN modelo_3d text NULL, ADD CONSTRAINT product_models_modelo_3d_check CHECK \(modelo_3d IS NULL OR modelo_3d ~ '\^\[a-z0-9_\]\{1,40\}\$'\);/);
    expect(sql).not.toMatch(/modelo_3d text NULL DEFAULT/i);
    expect(sql).not.toMatch(/\b(INSERT INTO|DELETE FROM|TRUNCATE)\b/i);
    // o único UPDATE é o da própria função (dentro dos corpos)
    const fora = sql.replace(/AS \$function\$.*?END \$function\$/g, "");
    expect(fora).not.toMatch(/\bUPDATE\b/);
  });

  it("guarda por md5 as duas funções lidas hoje, e recusa se a coluna ou o CHECK já existirem", () => {
    expect(sql).toContain("'public.cat_definir_modelo_3d(uuid,text,uuid,text)', '70b9ec82544c84c3b304944a4f933af6'");
    expect(sql).toContain("'public.cat_ler_modelos_gestao(uuid)', '72fd9d316844bf1382cf78acd0146f85'");
    expect(sql).toMatch(/table_name = 'product_models' AND c\.column_name = 'modelo_3d'/);
    expect(sql).toContain("co.conname = 'product_models_modelo_3d_check'");
  });

  it("cat_definir_modelo_3d mantém a assinatura e passa a aceitar p_alvo 'modelo', filtrado pela organização e sem apagados", () => {
    const f = corpo("cat_definir_modelo_3d");
    expect(f).toContain("cat_definir_modelo_3d(p_org uuid, p_alvo text, p_id uuid, p_modelo text) RETURNS jsonb");
    expect(f).toContain("SECURITY DEFINER SET search_path TO 'public', 'pg_temp'");
    expect(f).toContain("PERFORM public.fn_cat_exigir(p_org, 'products.edit');");
    expect(f).toContain("v_alvo NOT IN ('produto', 'categoria', 'modelo')");
    // os dois ramos antigos ficam como estavam
    expect(f).toContain("WHERE p.id = p_id AND p.organization_id = p_org AND p.tipo_catalogo IS NOT NULL AND NOT p.is_deleted FOR NO KEY UPDATE;");
    expect(f).toContain("hashtextextended('cat_categorias_produto:' || p_org::text, 0)");
    // o ramo novo: a chave por subcategoria de cat_estado_modelo, depois a linha da própria organização, viva
    expect(f).toContain("hashtextextended('cat_modelos:' || p_org::text || ':' || v_sub::text, 0)");
    expect(contar(f, "pm.id = p_id AND pm.organization_id = p_org AND pm.deleted_at IS NULL")).toBe(2);
    expect(f).toMatch(/pm\.deleted_at IS NULL FOR NO KEY UPDATE;/);
    expect(f).toContain("RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003';");
    expect(f).toContain("UPDATE product_models pm SET modelo_3d = v_modelo WHERE pm.id = p_id AND pm.modelo_3d IS DISTINCT FROM v_modelo;");
    expect(f).toContain("RETURN jsonb_build_object('alvo', v_alvo, 'id', p_id, 'modelo', v_modelo, 'anterior', v_anterior);");
  });

  it("cat_ler_modelos_gestao mantém a assinatura e o tipo (jsonb) e ganha só a chave 'modelo3d'", () => {
    const f = corpo("cat_ler_modelos_gestao");
    expect(f).toContain("cat_ler_modelos_gestao(p_org uuid) RETURNS jsonb");
    expect(f).toContain("PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);");
    expect(f).toContain("'id', pm.id, 'nome', pm.name, 'numero', pm.numero, 'ativo', pm.is_active, 'usados', coalesce(u.n, 0),");
    expect(f).toContain("'modelo3d', pm.modelo_3d");
    expect(f).toContain("ORDER BY coalesce(c.sort_order, 0), c.name, coalesce(s.sort_order, 0), s.name, pm.numero, pm.id");
    expect(f).toContain("WHERE pm.organization_id = p_org AND pm.deleted_at IS NULL");
    expect(sql).not.toMatch(/DROP FUNCTION/i);
  });

  it("privilégios: EXECUTE só a authenticated e service_role, nada a PUBLIC nem anon, nas duas funções", () => {
    for (const a of ["public.cat_definir_modelo_3d(uuid,text,uuid,text)", "public.cat_ler_modelos_gestao(uuid)"]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${a} FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${a} TO authenticated, service_role;`);
    }
    expect(sql).not.toMatch(/GRANT [^;]*TO [^;]*\banon\b/);
  });

  it("o bloco de conferir existe, converte o \"char\" do catálogo com ::text e os RAISE passam o texto como argumento", () => {
    expect(sql).toContain("DO $conferir$");
    expect(sql).toContain("co.contype::text = 'c'");
    expect(sql).not.toMatch(/\|\|\s*co\.contype\b(?!::text)/);
    // fora dos corpos das funções, todo o RAISE EXCEPTION com format() usa '%' como único marcador
    const fora = sql.replace(/AS \$function\$.*?END \$function\$/g, "");
    for (const m of fora.matchAll(/RAISE EXCEPTION '([^']*)'/g)) expect(["%", "Guarda: faltam fn_cat_exigir ou fn_cat_exigir_uma com os argumentos esperados."]).toContain(m[1]);
  });

  it("a reversão não está na pasta das migrations", () => {
    expect(existsSync(resolve(process.cwd(), "supabase/migrations/reverter-modelo3d-modelos.sql"))).toBe(false);
    expect(bruto).toContain("reverter-modelo3d-modelos.sql");
  });
});
