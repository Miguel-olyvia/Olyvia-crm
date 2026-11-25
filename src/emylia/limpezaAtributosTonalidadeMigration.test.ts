/**
 * @vitest-environment node
 */
// 25/11: a migration «apagar os atributos sem produtos e ligar a Tonalidade ao 3D» (20270126800000) lida como TEXTO.
// Confere o que se pode conferir sem a correr: o cabeçalho (só base de RH, não depende de código novo), que apaga por
// SOFT DELETE só os 2 atributos lidos (Brilho e Tipo de grelha), que a guarda de referências cobre as tabelas lidas no
// remoto, que liga a Tonalidade e dá às 3 opções a superfície certa, as conferências e os RAISE com % escapado. Erros de
// tipo do SQL só se apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270126800000_limpeza_atributos_tonalidade_mudelar.sql";
const caminho = resolve(pasta, nome);
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

const BRILHO = "f8caabe2-8622-4457-90a8-47f28c6bd9d8";
const GRELHA = "e4367ab0-9817-4474-a8e8-81665fad8a2a";
const TONALIDADE = "af171aa4-98a6-41b8-804c-470570d8ce0e";

/** As linhas das opções da Tonalidade: (id, value_text, superficie). */
const opcoes = [...sql.matchAll(/\('([0-9a-f-]{36})', '(BRILHO|MATE|ESCOVADO)', +'(polida|acetinada|mate)'\)/g)]
  .map((m) => ({ id: m[1], valor: m[2], superficie: m[3] }));

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz que é só da base de RH, que não depende de código novo e porquê soft delete", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain("NÃO DEPENDE DE CÓDIGO NOVO");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("PORQUÊ SOFT DELETE");
  });

  it("só toca a Mudelar: sai por NOTICE antes de escrever se a organização ou os atributos não existem", () => {
    expect(sql).toContain("c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355'");
    const semOrg = sql.indexOf("não existe nesta base — nada a fazer.', c_org; RETURN;");
    const semAtributos = sql.indexOf("não existem aqui — nada a fazer.'; RETURN;");
    const primeiraEscrita = sql.indexOf("UPDATE product_attributes");
    expect(semOrg).toBeGreaterThan(0);
    expect(semAtributos).toBeGreaterThan(semOrg);
    expect(primeiraEscrita).toBeGreaterThan(semAtributos);
    expect(sql).toMatch(/RAISE NOTICE 'limpeza_atributos_tonalidade: já aplicada/);
    expect(sql).toMatch(/RAISE EXCEPTION 'limpeza_atributos_tonalidade: estado a meio/);
  });

  it("apaga por soft delete só o «Brilho» e o «Tipo de grelha», sem DELETE físico", () => {
    expect(sql).toContain(`c_brilho constant uuid := '${BRILHO}'`);
    expect(sql).toContain(`c_grelha constant uuid := '${GRELHA}'`);
    expect(sql).toContain("(c_brilho, 'brilho', 'Brilho', c_g_brilho)");
    expect(sql).toContain("(c_grelha, 'tipo_grelha', 'Tipo de grelha', c_g_grelha)");
    expect(sql).toContain(
      "UPDATE product_attributes a SET deleted_at = now(), deleted_by = NULL WHERE a.id IN (c_brilho, c_grelha) AND a.organization_id = c_org AND a.deleted_at IS NULL",
    );
    expect(sql.match(/SET deleted_at/g)).toHaveLength(1);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    // grupos e opções ficam como estão (o «Restaurar» da aplicação devolve o atributo inteiro)
    expect(sql).not.toMatch(/UPDATE (public\.)?attribute_option_groups\b/i);
    expect(sql).not.toMatch(/SET is_active/);
  });

  it("a guarda de referências cobre as tabelas lidas no remoto e aborta se alguma existir", () => {
    for (const t of [
      "product_attribute_values", "product_attribute_value_prices", "product_attribute_price_ranges", "product_attribute_organizations",
      "category_attributes", "category_attribute_palettes", "product_family_axes", "product_config_slots", "product_config_slot_options",
      "product_config_rules", "product_codes", "cat_config_3d", "quote_lines", "purchase_order_items", "quote_template_items",
      "ops_ordem_tarefa_medicao", "ops_obra_tarefa", "ops_obra_servico_tarefa",
    ]) {
      expect(sql).toContain(`FROM ${t} x`);
    }
    expect(sql).toContain("coalesce(x.ligacoes::text, '') || coalesce(x.eixos::text, '')");
    expect(sql).toMatch(/RAISE EXCEPTION 'G2: os atributos a apagar ainda são referenciados \(%\)/);
    expect(sql).toMatch(/RAISE EXCEPTION 'G2: % ids a procurar \(esperados 8/);
    // a guarda vem antes de qualquer escrita
    expect(sql.indexOf("G2: os atributos a apagar")).toBeLessThan(sql.indexOf("SET deleted_at"));
  });

  it("liga a Tonalidade e dá às 3 opções a superfície certa (BRILHO polida, MATE e ESCOVADO mate), não metal", () => {
    expect(sql).toContain(`c_tonalidade constant uuid := '${TONALIDADE}'`);
    expect(sql).toContain("UPDATE product_attributes a SET has_aspect = true WHERE a.id = c_tonalidade AND a.organization_id = c_org");
    expect(sql.match(/has_aspect = true/g)).toHaveLength(1);
    expect(opcoes).toHaveLength(3);
    expect(new Set(opcoes.map((o) => o.id)).size).toBe(3);
    expect(Object.fromEntries(opcoes.map((o) => [o.valor, o.superficie]))).toEqual({ BRILHO: "polida", MATE: "mate", ESCOVADO: "mate" });
    expect(sql).toContain("UPDATE attribute_option_group_values o SET superficie = t.superficie, is_metal = false FROM _lt_ton t");
    expect(sql).not.toMatch(/is_metal = true/);
  });

  it("só escreve por UPDATE com ids fixos: sem DDL, sem INSERT nas tabelas, sem tocar em products, sem as RPCs", () => {
    expect(sql).not.toMatch(/\bINSERT INTO (public\.)?(product_attributes|attribute_option_groups|attribute_option_group_values|product_attribute_values)\b/i);
    expect(sql).not.toMatch(/\bUPDATE (public\.)?(products|product_attribute_values)\b/i);
    expect(sql).not.toMatch(/\b(ALTER|CREATE OR REPLACE FUNCTION|DROP FUNCTION|DROP TRIGGER|GRANT|REVOKE)\b/i);
    expect(sql.match(/DROP TABLE IF EXISTS [^;]*;/g)?.every((d) => !/public\./.test(d) && /pg_temp\._lt_/.test(d))).toBe(true);
    expect(sql).not.toMatch(/SET sigla|sigla = |SET hex_color|SET foto_path|SET group_id|SET sku_ordem/);
    expect(sql).not.toMatch(/cat_aspeto_opcao\(|cat_definir_aspeto_atributo\(|rpc_delete_product_attribute\(/);
  });

  it("guardas e conferências: contagens antes e depois, hash do que fica fora do âmbito, auditoria identificada", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'G0: só % dos 2 atributos a apagar/);
    expect(sql).toMatch(/RAISE EXCEPTION 'G1: só % das 3 opções da Tonalidade/);
    expect(sql).toMatch(/RAISE EXCEPTION 'C1: % de 2 apagados; % apagados na base \(antes %, esperado mais 2\)/);
    expect(sql).toMatch(/RAISE EXCEPTION 'C2: % de 3 opções da Tonalidade/);
    expect(sql).toMatch(/RAISE EXCEPTION 'C3: % atributos e % opções mexidos/);
    expect(sql).toMatch(/RAISE EXCEPTION 'C4: fora do âmbito, os outros atributos mudaram/);
    expect(sql).toMatch(/RAISE EXCEPTION 'C4: fora do âmbito, os grupos de opções mudaram/);
    expect(sql).toMatch(/RAISE EXCEPTION 'C4: fora do âmbito, as outras opções mudaram/);
    expect(sql).toContain("PERFORM set_config('app.audit_source', c_fonte, true);");
    expect(sql).toContain("c_fonte constant text := 'migration:limpeza_atributos_tonalidade'");
    expect(sql).toMatch(/SET lock_timeout = '5s';/);
  });

  it("os RAISE com % literal estão escapados (nenhum % sem parâmetro)", () => {
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

  it("nenhuma migration de reversão desta e nenhum carimbo repetido", () => {
    expect(readdirSync(pasta).filter((f) => /limpeza_atributos|reverter_limpeza/.test(f))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270126800000_"))).toHaveLength(1);
  });
});
