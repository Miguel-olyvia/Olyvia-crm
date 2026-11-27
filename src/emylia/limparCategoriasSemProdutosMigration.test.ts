/**
 * @vitest-environment node
 */
// 27/11: a migration de DADOS que tira as categorias e subcategorias sem produtos (20270130380000, soft delete como o
// ecrã), lida como TEXTO. Confere o que se pode conferir sem a correr: a lista embutida (ids únicos, só a Mudelar da RH;
// a nike não é tocada, contagens iguais às constantes, nenhuma das categorias que o dono mandou manter), que só faz UPDATE de
// is_active, deleted_at e deleted_by em product_categories (nada de DELETE, nem escrita noutras tabelas), as guardas
// antes da escrita e as conferências depois, a cópia fechada, os RAISE com tantos % como argumentos e que a reversão não
// está na pasta das migrations. Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270130380000_limpar_categorias_sem_produtos.sql";
const bruto = existsSync(resolve(pasta, nome)) ? readFileSync(resolve(pasta, nome), "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

const MUDELAR = "3242e925-da26-459a-8258-be04d904e355";
const NIKE = "b6ffce4f-f630-4933-833a-008649757a33";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const constante = (n: string): number => Number((sql.match(new RegExp(`${n} constant integer := (\\d+);`)) ?? [])[1]);

const lista = bruto.slice(bruto.indexOf("INSERT INTO _lc_cat"), bruto.indexOf("DO $mig$"));
const cats = [...lista.matchAll(new RegExp(`\\('(${UUID})', '(${UUID})', '((?:[^']|'')*)', '([A-Z0-9]{1,6})', (NULL|'${UUID}')\\)`, "g"))]
  .map((m) => ({ id: m[1], org: m[2], nome: m[3].replace(/''/g, "'"), sigla: m[4], pai: m[5] === "NULL" ? null : m[5].slice(1, -1) }));

/** As que o dono manda manter (têm negócios, são pais das que ficam, ou estão no Excel da Mudelar). */
const FICAM = [
  "1fd72eea-4193-402c-b362-68800dbbc67c", // Materiais
  "4abd6251-f6c0-4862-94c6-edb2e46fe0d6", // laminados
  "05a635ef-f893-41a5-affb-f4507076b804", // Portas Interiores
  "a3861ebc-f2d9-45be-beac-2d8061a5d80e", // Janelas PVC
  "1ca86cdf-a0c3-4f8c-ab3c-d680cc2266c8", // Janelas
  "dfd635df-e9a1-4bf3-b242-57926137287b", // Bancadas de Cozinha
  "5214c966-2c55-48b2-9b61-10358494d9c8", // Portas
  "e9461498-d8cc-4b64-864b-b5fdd32bf208", // Painéis Acústicos
];

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz a base, as organizações, o pedido, o que não faz, a ordem e a reversão", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain(`SÓ A MUDELAR DA RH (${MUDELAR})`);
    expect(bruto).toContain(`A NIKE (${NIKE}) NÃO É TOCADA`);
    expect(bruto).toContain("tira categorias e subcategorias que nao teem produtos");
    expect(bruto).toContain("O QUE NÃO FAZ: não apaga fisicamente nada");
    expect(bruto).toContain("depois de 20270130370000");
    expect(bruto).toContain("antes de 20270130400000");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("REVERSÃO fora da pasta das migrations");
  });

  it("uma só transação: BEGIN, SET LOCAL dos tempos e COMMIT no fim", () => {
    expect(sql).toMatch(/^ ?BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '5min';/);
    expect(sql.trim().endsWith("END $mig$; COMMIT;")).toBe(true);
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
  });

  it("a lista tem os números das constantes, ids únicos, só a Mudelar (a nike não é tocada)", () => {
    expect(cats).toHaveLength(constante("c_n_cat"));
    expect(new Set(cats.map((c) => c.id)).size).toBe(cats.length);
    expect(cats.filter((c) => c.org === MUDELAR)).toHaveLength(constante("c_n_mudelar"));
    expect(cats.filter((c) => c.org === NIKE)).toHaveLength(0);
    expect(cats.every((c) => c.org === MUDELAR)).toBe(true);
    expect(cats.filter((c) => c.pai === null)).toHaveLength(constante("c_n_topo"));
    expect(cats.filter((c) => c.pai !== null)).toHaveLength(constante("c_n_sub"));
    expect([constante("c_n_cat"), constante("c_n_mudelar"), constante("c_n_nike")]).toEqual([14, 14, 0]);
    expect([constante("c_n_topo"), constante("c_n_sub")]).toEqual([1, 13]);
    expect(bruto).not.toContain("49b9a13f-1862-4587-871b-897119697c51"); // rafaelcategoria (nike) fica
    expect(constante("c_vivas_mudelar")).toBe(94);
    expect(constante("c_vivas_nike")).toBe(34);
  });

  it("não apaga nenhuma das que ficam, nem uma que seja pai de outra da lista", () => {
    for (const id of FICAM) expect(cats.map((c) => c.id)).not.toContain(id);
    const ids = new Set(cats.map((c) => c.id));
    expect(cats.some((c) => c.pai !== null && ids.has(c.pai))).toBe(false);
    expect(cats.map((c) => c.nome)).not.toContain("Painéis Acústicos");
  });

  it("só escreve por UPDATE de is_active, deleted_at e deleted_by em product_categories (soft delete, como o ecrã)", () => {
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql.replace(/ON COMMIT DROP/g, "")).not.toMatch(/\bDROP\b/i);
    const updates = sql.match(/\bUPDATE\s+\w+/gi) ?? [];
    expect(updates).toEqual(["UPDATE product_categories"]);
    expect(sql).toContain("SET is_active = false, deleted_at = v_agora, deleted_by = c_criador FROM _lc_cat s WHERE c.id = s.id AND c.organization_id = c_mudelar AND s.org = c_mudelar AND c.deleted_at IS NULL;");
    const inserts = (sql.match(/\bINSERT INTO [\w.]+/gi) ?? []).map((s) => s.replace(/INSERT INTO /i, ""));
    expect(inserts.sort()).toEqual(["_lc_cat", "_limpeza_catalogo.categorias_sem_produtos"]);
    expect(sql).not.toMatch(/audit_bypass', 'on'/);
  });

  it("guardas antes da escrita e conferências depois", () => {
    const escrita = sql.indexOf("UPDATE product_categories");
    for (const g of ["L1:", "G1:", "G2:", "G3:", "G4:", "G5:", "G6:", "G7:", "B1:"]) {
      expect(sql.indexOf(g)).toBeGreaterThan(0);
      expect(sql.indexOf(g)).toBeLessThan(escrita);
    }
    for (const c of ["W1:", "C1:", "C2:", "C3:", "C4:", "C5:", "C6:", "C7:"]) expect(sql.indexOf(c)).toBeGreaterThan(escrita);
    for (const t of ["cat_config_3d", "category_attribute_palettes", "category_attributes", "inventory_counts",
      "product_attribute_price_ranges", "product_attribute_value_prices", "product_category_organizations", "product_models",
      "services", "supplier_catalog_items", "bundles", "deal_needs", "negocio_produtos", "quote_versao_produtos", "ops_ativo",
      "ops_medicao_def", "negocio_vista_cliente"]) expect(sql).toContain(`FROM ${t} x`);
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("to_regclass('_mudelar_excel.onda3_produtos') IS NULL");
  });

  it("a cópia fica num schema fechado e as conferências do catálogo convertem para ::text", () => {
    expect(sql).toContain("REVOKE ALL ON SCHEMA _limpeza_catalogo FROM PUBLIC, anon, authenticated, service_role;");
    expect(sql).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA _limpeza_catalogo FROM PUBLIC, anon, authenticated, service_role;");
    expect(sql).toContain("n.nspacl::text");
    expect(sql).toContain("c.relkind::text = 'r'");
    expect(sql).not.toMatch(/\bGRANT\b/i);
  });

  it("cada RAISE tem tantos % como argumentos", () => {
    const raises = [...sql.matchAll(/RAISE (?:EXCEPTION|NOTICE) '((?:[^']|'')*)'((?:, [^;]+)?);/g)];
    expect(raises.length).toBeGreaterThan(20);
    for (const r of raises) {
      const marcas = (r[1].match(/%/g) ?? []).length;
      const args = r[2] ? r[2].slice(2).split(/, (?![^(]*\))/).length : 0;
      expect({ msg: r[1], args }).toEqual({ msg: r[1], args: marcas });
    }
  });

  it("a reversão não está na pasta das migrations", () => {
    const nomes = readdirSync(pasta);
    expect(nomes.some((n) => /reverter/i.test(n) && /categorias/i.test(n))).toBe(false);
  });
});
