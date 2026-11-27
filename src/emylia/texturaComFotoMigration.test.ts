/**
 * @vitest-environment node
 */
// 27/11: a migration «a Textura da Mudelar com foto» (20270130370000) lida como TEXTO. Confere o que se pode conferir sem a correr: o cabeçalho (só base de RH, depende do
// código novo, o que o ecrã faz), que só escreve UMA linha de product_attributes (a Textura da Mudelar-do-RH), os dois valores ligados, as guardas (organização ausente
// sai por NOTICE; mais de uma linha, medida, grupo partilhado e estado a meio falham), que não toca em opções nem faz DDL, e os RAISE com % escapado. Erros de tipo do
// SQL só se apanham a correr na base.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nome = "20270130370000_textura_com_foto_mudelar.sql";
const caminho = resolve(process.cwd(), "supabase/migrations", nome);
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz o que o ecrã faz, que é só da base de RH, que depende de código novo e que fica presa", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain("O QUE O ECRÃ FAZ DEPOIS");
    expect(bruto).toContain("DEPENDE DE CÓDIGO NOVO");
    expect(bruto).toContain("ehAtributoDeTextura");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("OUTRA migration");
  });

  it("só a organização e o código certos: um UPDATE de product_attributes, por id, na Mudelar-do-RH, code 'textura', não medida, viva", () => {
    expect(sql).toContain("c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355'");
    const updates = sql.match(/UPDATE [a-z_.]+ /g) ?? [];
    expect(updates).toEqual(["UPDATE product_attributes "]);
    expect(sql).toContain("UPDATE product_attributes a SET has_hex_color = true, has_photo = true WHERE a.id = v_id AND a.organization_id = c_org AND a.code = 'textura' AND a.deleted_at IS NULL AND NOT a.has_hex_color AND NOT a.has_photo AND NOT a.is_measurement");
    // os dois valores ligados na mesma linha e nada mais (a CHECK has_photo exige has_hex_color)
    expect(sql.match(/SET [^;]*;/g)?.filter((s) => /has_photo/.test(s))).toHaveLength(1);
    expect(sql).not.toContain("has_aspect = ");
  });

  it("nenhuma outra escrita: sem INSERT, DELETE, DDL, REVOKE/GRANT, nem tocar nas opções ou nos valores dos produtos", () => {
    expect(sql).not.toMatch(/\b(INSERT|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/);
    expect(sql).not.toMatch(/UPDATE attribute_option_group_values|UPDATE products|UPDATE product_attribute_values/);
  });

  it("a guarda salta quando a organização não existe (NOTICE e RETURN, antes de escrever), tal como quando não há atributo textura", () => {
    const semOrg = sql.indexOf("não existe nesta base — nada a fazer.', c_org; RETURN;");
    const semAtributo = sql.indexOf("não tem o atributo «textura» nesta base — nada a fazer.'; RETURN;");
    const escreve = sql.indexOf("UPDATE product_attributes");
    expect(semOrg).toBeGreaterThan(-1);
    expect(semAtributo).toBeGreaterThan(semOrg);
    expect(escreve).toBeGreaterThan(semAtributo);
    expect(sql).toContain("IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.deleted_at IS NULL)");
  });

  it("falha (RAISE EXCEPTION) com mais de um atributo, medida ou não lista, grupo partilhado e estado a meio; já aplicada sai por NOTICE", () => {
    expect(sql).toMatch(/IF v_n <> 1 THEN RAISE EXCEPTION '[^']*atributos «textura» vivos/);
    expect(sql).toMatch(/IF v_med OR v_tipo IS DISTINCT FROM 'list' THEN RAISE EXCEPTION/);
    expect(sql).toMatch(/IF v_grupo IS NOT NULL AND v_n > 0 THEN RAISE EXCEPTION '[^']*partilhado/);
    expect(sql).toMatch(/estado a meio \(has_hex_color=%, has_photo=%\)/);
    expect(sql).toContain("já aplicada (has_hex_color e has_photo a true) — nada a fazer.'; RETURN;");
    expect(sql).toContain("FOR NO KEY UPDATE");
  });

  it("confere depois de escrever: os dois valores, os outros atributos e as opções da Textura ficam como estavam", () => {
    expect(sql).toContain("IF NOT (v_hex AND v_foto) OR v_med THEN RAISE EXCEPTION");
    expect(sql).toContain("IF v_fora_depois <> v_fora_antes THEN RAISE EXCEPTION");
    expect(sql).toContain("IF v_opc_depois IS DISTINCT FROM v_opc_antes THEN RAISE EXCEPTION");
    expect(sql).toContain("IF v_n <> 1 THEN RAISE EXCEPTION");
  });

  it("marca a origem para a auditoria, e todo o RAISE tem tantos % quantos os argumentos (nenhum % solto)", () => {
    expect(sql).toContain("set_config('app.audit_source', c_fonte, true)");
    expect(sql).toContain("c_fonte constant text := 'migration:textura_com_foto_mudelar'");
    const raises = [...sql.matchAll(/RAISE (?:EXCEPTION|NOTICE) '((?:[^']|'')*)'((?:, [^;]*)?);/g)];
    expect(raises.length).toBeGreaterThanOrEqual(10);
    for (const r of raises) {
      const marcas = (r[1].match(/%/g) ?? []).length;
      // os argumentos separam-se por vírgulas de topo (nenhum dos nossos tem vírgulas dentro de parênteses)
      const args = r[2] ? r[2].split(",").map((s) => s.trim()).filter(Boolean).length : 0;
      expect(marcas, r[1]).toBe(args);
    }
  });

  it("guarda a base que lhe é própria: só um DO, com SET lock_timeout e statement_timeout", () => {
    expect(sql).toContain("SET lock_timeout = '5s'");
    expect(sql).toContain("SET statement_timeout = '2min'");
    expect((sql.match(/DO \$mig\$/g) ?? []).length).toBe(1);
  });

  it("a reversão NÃO está na pasta das migrations (uma reversão na pasta é aplicada pelo db push)", () => {
    const pasta = resolve(process.cwd(), "supabase/migrations");
    expect(existsSync(resolve(pasta, "20270130370001_reverter_textura_com_foto_mudelar.sql"))).toBe(false);
    expect(existsSync(resolve(pasta, "reverter_textura_com_foto_mudelar.sql"))).toBe(false);
  });
});
