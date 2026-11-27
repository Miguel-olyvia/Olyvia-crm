/**
 * @vitest-environment node
 */
// 27/11: a migration «GLB próprio por categoria, subcategoria e Modelo» (20270130420000) lida como TEXTO. Confere o que se pode conferir sem a
// correr: o cabeçalho (só base de RH, o que os ecrãs e o 3D têm de fazer), as colunas e os CHECK nas duas tabelas, o bucket e as três políticas
// (sem UPDATE), a RPC cat_definir_glb (products.edit, search_path vazio, partilhada e apagado recusados, tamanho lido do armazenamento), as
// chaves novas nas duas leituras, os privilégios, as guardas por md5 e os RAISE com % passado como argumento. Erros de tipo do SQL só se
// apanham a correr na base.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const caminho = resolve(process.cwd(), "supabase/migrations/20270130420000_catalogo_glb_proprio.sql");
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");
const contar = (texto: string, agulha: string): number => texto.split(agulha).length - 1;
const REGEX_GLB = "'^[0-9a-f-]{36}/[0-9a-f-]{36}\\.glb$'";
const REGEX_UUID = "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'";

/** O corpo de uma função criada na migration (de CREATE … até END $function$). */
function corpo(nome: string): string {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
  if (i < 0) return "";
  const f = sql.indexOf("END $function$", i);
  return f < 0 ? "" : sql.slice(i, f);
}

/** O texto de uma política (de CREATE POLICY nome … até ao ;). */
function politica(nome: string): string {
  const i = sql.indexOf(`CREATE POLICY ${nome} ON storage.objects`);
  if (i < 0) return "";
  return sql.slice(i, sql.indexOf(";", i));
}

describe("migration 20270130420000_catalogo_glb_proprio.sql", () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz que é só da base de RH e o que os ecrãs e o 3D têm de fazer", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toMatch(/PRECISA DE CÓDIGO NOVO/);
    for (const s of ["GestaoModelos.tsx", "modelosDados.ts", "cat_ler_categorias_gestao", "anterior_orfao", "model/gltf-binary", "PREVIA_SO_GENERICOS",
      "Draco", "200 000", "metal, vidro, espelho, luz ou agua"]) expect(bruto).toContain(s);
  });

  it("acrescenta glb_caminho text e glb_bytes integer NULL nas duas tabelas, com os três CHECK, sem default e sem mexer em dados", () => {
    for (const t of ["product_categories", "product_models"]) {
      expect(sql).toContain(`ALTER TABLE public.${t} ADD COLUMN glb_caminho text NULL, ADD COLUMN glb_bytes integer NULL,`);
      expect(sql).toContain(`ADD CONSTRAINT ${t}_glb_par_check CHECK ((glb_caminho IS NULL) = (glb_bytes IS NULL))`);
      expect(sql).toContain(`ADD CONSTRAINT ${t}_glb_caminho_check CHECK (glb_caminho IS NULL OR (glb_caminho ~ ${REGEX_GLB} AND organization_id IS NOT NULL AND split_part(glb_caminho, '/', 1) = organization_id::text))`);
      expect(sql).toContain(`ADD CONSTRAINT ${t}_glb_bytes_check CHECK (glb_bytes IS NULL OR glb_bytes BETWEEN 12 AND 5242880)`);
    }
    expect(sql).not.toMatch(/glb_(caminho|bytes) (text|integer) NULL DEFAULT/i);
    expect(sql).not.toMatch(/\b(DELETE FROM|TRUNCATE)\b/i);
    // fora dos corpos das funções: nenhum UPDATE, e o único INSERT é o do bucket
    const fora = sql.replace(/AS \$function\$.*?END \$function\$/g, "");
    expect(fora).not.toMatch(/;\s*UPDATE\s/);
    expect(contar(fora, "INSERT INTO")).toBe(1);
    expect(fora).toContain("INSERT INTO storage.buckets");
  });

  it("cria o bucket público catalogo-modelos3d, 5 MB, só model/gltf-binary", () => {
    expect(sql).toContain("VALUES ('catalogo-modelos3d', 'catalogo-modelos3d', true, 5242880, ARRAY['model/gltf-binary']) ON CONFLICT (id) DO NOTHING;");
  });

  it("três políticas copiadas de cat_opcoes_*: caminho uuid/uuid.glb no INSERT, organização pelo 1.º segmento, products.edit, e nenhuma de UPDATE", () => {
    const criar = politica("cat_modelos3d_criar");
    expect(criar).toContain("FOR INSERT TO authenticated WITH CHECK");
    expect(criar).toContain(`name ~ ${REGEX_GLB}`);
    for (const [nome, cmd] of [["cat_modelos3d_criar", "INSERT"], ["cat_modelos3d_apagar", "DELETE"], ["cat_modelos3d_ler", "SELECT"]]) {
      const p = politica(nome);
      expect(p).toContain(`FOR ${cmd} TO authenticated`);
      expect(p).toContain("bucket_id = 'catalogo-modelos3d'");
      expect(p).toContain(`CASE WHEN split_part(name, '/', 1) ~ ${REGEX_UUID} THEN public.fn_cat_pode(split_part(name, '/', 1)::uuid, 'products.edit') ELSE false END`);
    }
    expect(sql).not.toMatch(/CREATE POLICY [a-z0-9_]+ ON storage\.objects FOR (UPDATE|ALL)/);
  });

  it("cat_definir_glb: SECURITY DEFINER com search_path vazio, products.edit, só categoria ou modelo, caminho da organização", () => {
    const f = corpo("cat_definir_glb");
    expect(f).toContain("cat_definir_glb(p_org uuid, p_alvo text, p_id uuid, p_caminho text) RETURNS jsonb");
    expect(f).toContain("SECURITY DEFINER SET search_path = ''");
    expect(f).toContain("PERFORM public.fn_cat_exigir(p_org, 'products.edit');");
    expect(f).toContain("v_alvo NOT IN ('categoria', 'modelo')");
    expect(f).toContain(`v_caminho !~ ${REGEX_GLB}`);
    expect(f).toContain("split_part(v_caminho, '/', 1) <> p_org::text");
    // com search_path vazio, tudo o que é da base vai qualificado
    expect(f).not.toMatch(/(FROM|UPDATE) (product_categories|product_models|objects)\b/);
  });

  it("cat_definir_glb: partilhada recusada, apagados e de outra organização = não encontrado, e as chaves de lock de cat_definir_modelo_3d", () => {
    const f = corpo("cat_definir_glb");
    expect(f).toContain("hashtextextended('cat_categorias_produto:' || p_org::text, 0)");
    expect(f).toContain("pc.id = p_id AND pc.deleted_at IS NULL AND pc.organization_id IS NULL");
    expect(f).toContain("RAISE EXCEPTION 'Categoria partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';");
    expect(f).toMatch(/pc\.id = p_id AND pc\.deleted_at IS NULL AND pc\.organization_id = p_org FOR NO KEY UPDATE;/);
    expect(f).toContain("RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003';");
    expect(f).toContain("hashtextextended('cat_modelos:' || p_org::text || ':' || v_sub::text, 0)");
    expect(contar(f, "pm.id = p_id AND pm.organization_id = p_org AND pm.deleted_at IS NULL")).toBe(2);
    expect(f).toMatch(/pm\.deleted_at IS NULL FOR NO KEY UPDATE;/);
    expect(contar(f, "RAISE EXCEPTION 'Modelo não encontrado.' USING ERRCODE = 'CT003';")).toBe(2);
  });

  it("cat_definir_glb: o ficheiro tem de existir no bucket e o tamanho e o tipo vêm do armazenamento, não do cliente", () => {
    const f = corpo("cat_definir_glb");
    expect(f).toContain("SELECT so.metadata->>'size', so.metadata->>'mimetype' INTO v_tamanho, v_tipo FROM storage.objects so WHERE so.bucket_id = 'catalogo-modelos3d' AND so.name = v_caminho;");
    expect(f).toContain("USING ERRCODE = 'CT006'");
    expect(f).toContain("v_tipo IS DISTINCT FROM 'model/gltf-binary'");
    expect(f).toContain("v_bytes < 12 OR v_bytes > c_limite");
    expect(f).toContain("c_limite constant integer := 5242880;");
    expect(contar(f, "USING ERRCODE = 'CT007'")).toBe(3);
    // nenhum argumento traz o tamanho
    expect(f).not.toMatch(/p_bytes|p_tamanho/);
    expect(f).toContain("UPDATE public.product_categories pc SET glb_caminho = v_caminho, glb_bytes = v_bytes");
    expect(f).toContain("UPDATE public.product_models pm SET glb_caminho = v_caminho, glb_bytes = v_bytes");
  });

  it("cat_definir_glb: NULL remove a ligação e devolve {alvo, id, caminho, anterior, anterior_orfao}, órfão olhando para as duas tabelas", () => {
    const f = corpo("cat_definir_glb");
    expect(f).toContain("v_caminho := nullif(btrim(coalesce(p_caminho, '')), '');");
    expect(f).toContain("NOT EXISTS (SELECT 1 FROM public.product_categories x WHERE x.glb_caminho = v_anterior)");
    expect(f).toContain("NOT EXISTS (SELECT 1 FROM public.product_models y WHERE y.glb_caminho = v_anterior)");
    expect(f).toContain("RETURN jsonb_build_object('alvo', v_alvo, 'id', p_id, 'caminho', v_caminho, 'anterior', v_anterior, 'anterior_orfao', v_orfao);");
  });

  it("as duas leituras mantêm assinatura e tipo (jsonb, sem DROP) e ganham glb_caminho e glb_bytes em categoria, subcategoria e Modelo", () => {
    const cats = corpo("cat_ler_categorias_gestao");
    expect(cats).toContain("cat_ler_categorias_gestao(p_org uuid) RETURNS jsonb");
    expect(cats).toContain("PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);");
    expect(cats).toContain("'usados', coalesce(uc.n, 0), 'sigla', t.sigla, 'modelo3d', t.modelo3d,");
    expect(cats).toContain("'usados', coalesce(us.n, 0), 'sigla', s.sigla, 'modelo3d', s.modelo3d, 'glb_caminho', s.glb_caminho, 'glb_bytes', s.glb_bytes)");
    expect(cats).toContain("'glb_caminho', t.glb_caminho, 'glb_bytes', t.glb_bytes) ORDER BY t.ordem, t.name, t.id");
    expect(cats).toContain("ORDER BY s.ordem, s.name, s.id");
    const mods = corpo("cat_ler_modelos_gestao");
    expect(mods).toContain("cat_ler_modelos_gestao(p_org uuid) RETURNS jsonb");
    expect(mods).toContain("'modelo3d', pm.modelo_3d, 'glb_caminho', pm.glb_caminho, 'glb_bytes', pm.glb_bytes)");
    expect(mods).toContain("ORDER BY coalesce(c.sort_order, 0), c.name, coalesce(s.sort_order, 0), s.name, pm.numero, pm.id");
    expect(mods).toContain("WHERE pm.organization_id = p_org AND pm.deleted_at IS NULL");
    expect(sql).not.toMatch(/DROP FUNCTION/i);
  });

  it("privilégios: EXECUTE só a authenticated e service_role, nada a PUBLIC nem anon, nas três funções", () => {
    for (const a of ["public.cat_definir_glb(uuid,text,uuid,text)", "public.cat_ler_categorias_gestao(uuid)", "public.cat_ler_modelos_gestao(uuid)"]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${a} FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${a} TO authenticated, service_role;`);
    }
    expect(sql).not.toMatch(/GRANT [^;]*TO [^;]*\banon\b/);
  });

  it("guarda por md5 as duas leituras lidas hoje e recusa se o que se cria já existir", () => {
    expect(sql).toContain("'public.cat_ler_categorias_gestao(uuid)', '1c5fe83d63f28f6ebab7f3ddac8fe9f0'");
    expect(sql).toContain("'public.cat_ler_modelos_gestao(uuid)', '8274f515115545f548725ab589b695cb'");
    expect(sql).toContain("c.column_name IN ('glb_caminho', 'glb_bytes')");
    expect(sql).toContain("p.proname = 'cat_definir_glb'");
    expect(sql).toContain("b.id = 'catalogo-modelos3d'");
  });

  it("o bloco de conferir existe, converte o \"char\" do catálogo com ::text e os RAISE fora das funções passam o texto como argumento", () => {
    expect(sql).toContain("DO $conferir$");
    expect(sql).toContain("co.contype::text = 'c'");
    expect(sql).toContain("'search_path=\"\"'");
    expect(sql).not.toMatch(/\|\|\s*co\.contype\b(?!::text)/);
    const fora = sql.replace(/AS \$function\$.*?END \$function\$/g, "");
    for (const m of fora.matchAll(/RAISE EXCEPTION '([^']*)'/g)) expect(m[1]).toBe("%");
    // dentro das funções nenhum RAISE usa % (não há argumentos a passar)
    expect(corpo("cat_definir_glb")).not.toMatch(/RAISE EXCEPTION '[^']*%/);
  });

  it("a reversão não está na pasta das migrations", () => {
    expect(existsSync(resolve(process.cwd(), "supabase/migrations/reverter-glb-proprio.sql"))).toBe(false);
    expect(bruto).toContain("reverter-glb-proprio.sql");
  });
});
