/**
 * @vitest-environment node
 */
// 27/11: a migration de DADOS «Mudelar igual aos Excels», onda 4b (20270129850000: repor os 3 produtos que a onda 4 arquivou
// por engano e a ligação a fornecedor de cada um), lida como TEXTO. Confere o que se pode conferir sem a correr: a lista embutida
// (3 ids, SKU e ligações únicos, os da onda 4), que só REPÕE (UPDATE de is_deleted/deleted_at/deleted_by em products e de
// deleted_at/deleted_by em item_suppliers; nada de DELETE, INSERT fora da lista, SKU, famílias nem documentos), guardas antes da
// escrita e conferências depois, os RAISE com tantos % como argumentos e que a reversão não está na pasta das migrations.
// Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270129850000_mudelar_excel_onda4b.sql";
const caminho = resolve(pasta, nome);
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");
const onda4 = readFileSync(resolve(pasta, "20270129800000_mudelar_excel_onda4.sql"), "utf8");

const ORG = "3242e925-da26-459a-8258-be04d904e355";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const constante = (n: string): number => Number((sql.match(new RegExp(`${n} constant integer := (\\d+);`)) ?? [])[1]);

const i0 = bruto.indexOf("INSERT INTO _o4b_prod"), i1 = bruto.indexOf("DO $mig$");
const prods = [...bruto.slice(i0, i1).matchAll(new RegExp(`\\('(${UUID})', '([^']*)', '(${UUID})', '([^']*)'\\)`, "g"))]
  .map((m) => ({ id: m[1], sku: m[2], isup: m[3], linha: m[4] }));

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz a base, a organização, o pedido, o que não faz, os gatilhos, a ordem e a reversão", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain(`SÓ A MUDELAR (${ORG})`);
    expect(bruto).toContain("100% iguais aos do excel");
    expect(bruto).toContain("O QUE NÃO FAZ: não apaga nada (nenhum DELETE)");
    expect(bruto).toContain("fn_item_suppliers_sync_preferred");
    expect(bruto).toContain("fn_item_suppliers_check_preferred_conflict");
    expect(bruto).toContain("fn_products_barcode_guard");
    expect(bruto).toContain("depois de 20270129800000");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("REVERSÃO fora da pasta das migrations");
  });

  it("uma só transação: BEGIN, SET LOCAL dos tempos e COMMIT no fim", () => {
    expect(sql).toMatch(/^ ?BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '5min';/);
    expect(sql.trim().endsWith("END $mig$; COMMIT;")).toBe(true);
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
  });

  it("a lista tem os 3 produtos reclamados pelo Excel, com as ligações que a onda 4 arquivou", () => {
    expect(prods).toHaveLength(3);
    expect(constante("c_n_produtos")).toBe(3);
    expect(prods.map((p) => [p.sku, p.linha])).toEqual([
      ["EL-PL-0001-80", "EP0012"], ["EL-MLL-0004-45", "EMLL0007"], ["EL-MLL-0001-45", "EMLL0008"],
    ]);
    expect(new Set(prods.map((p) => p.id)).size).toBe(3);
    expect(new Set(prods.map((p) => p.isup)).size).toBe(3);
    // são os mesmos pares (produto, SKU) e (ligação, produto) da lista da onda 4
    for (const p of prods) {
      expect(onda4, p.sku).toContain(`('${p.id}', '${p.sku}', false)`);
      expect(onda4, p.isup).toContain(`('${p.isup}', '${p.id}')`);
    }
    expect(constante("c_n_mudelar")).toBe(32147);
    expect(constante("c_n_cons")).toBe(145);
    expect(constante("c_n_fam")).toBe(548);
    expect(constante("c_n_membros")).toBe(14637);
  });

  it("só REPÕE: UPDATE de products (os três campos) e de item_suppliers; nada de DELETE, INSERT, SKU, famílias nem documentos", () => {
    const corpo = sql.slice(sql.indexOf("DO $mig$"));
    const updates = [...corpo.matchAll(/\bUPDATE (\w+) (\w+ )?SET ([^;]*?) (?:WHERE|FROM)/g)].map((m) => [m[1], m[3]]);
    expect(updates).toEqual([
      ["products", "is_deleted = false, deleted_at = NULL, deleted_by = NULL"],
      ["item_suppliers", "deleted_at = NULL, deleted_by = NULL, updated_at = now()"],
    ]);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect([...sql.matchAll(/INSERT INTO ([\w.]+)/g)].map((m) => m[1])).toEqual(["_o4b_prod"]);
    expect(sql).not.toMatch(/cat_gerar_sku_produto\s*\(|rpc_\w+\s*\(/);
    expect(sql).not.toMatch(/(product_family_members|product_families|product_codes|product_prices|product_attribute_values) (\w+ )?SET\b/);
    expect(sql).not.toMatch(/(quote_lines|negocio_produtos|purchase_order_items|negocio_vista_cliente|service_materials|stock_movements) (\w+ )?SET\b/);
    // products.supplier_id volta pelo gatilho de preferencial, não por escrita direta
    expect(sql).not.toMatch(/SET supplier_id|, supplier_id = /);
    // a auditoria dos gatilhos desliga-se só à volta das duas escritas, e cada uma tem a linha manual
    const on = corpo.indexOf("set_config('app.audit_bypass', 'on', true)"), off = corpo.indexOf("set_config('app.audit_bypass', 'off', true)");
    expect(on).toBeGreaterThan(0);
    expect(corpo.indexOf("UPDATE products p SET")).toBeGreaterThan(on);
    expect(corpo.indexOf("UPDATE item_suppliers i SET")).toBeLessThan(off);
    expect(corpo.match(/set_config\('app\.audit_bypass', 'on', true\)/g)).toHaveLength(1);
    expect(corpo.match(/PERFORM fn_manual_audit_log\('(products|item_suppliers)'/g)).toHaveLength(2);
    // só repõe o que a onda 4 arquivou, e não repõe os bloqueados pelo código de barras
    expect(corpo).toContain("AND p.organization_id = c_org AND p.is_deleted AND p.deleted_by = c_criador;");
    expect(corpo).toContain("AND i.organization_id = c_org AND i.deleted_at IS NOT NULL AND i.deleted_by = c_criador;");
    expect(corpo.match(/NOT IN \(SELECT b\.id FROM _o4b_bloq b\)|NOT IN \(SELECT bl\.id FROM _o4b_bloq bl\)/g)!.length).toBeGreaterThanOrEqual(4);
  });

  it("o único DDL são as temporárias; nenhum GRANT, e a cópia da onda 4 só se lê", () => {
    const ddl = [...sql.matchAll(/(?:^|;|\bTHEN|\bLOOP)\s*((?:CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT)\b[^;(]*)/gi)].map((m) => m[1].trim());
    for (const d of ddl) expect(d).toMatch(/^CREATE TEMP TABLE _o4b_(prod|bloq)( ON COMMIT DROP AS SELECT DISTINCT x\.id FROM _o4b_prod x JOIN products p ON p\.id = x\.id WHERE EXISTS)?$/);
    expect(ddl).toHaveLength(2);
    expect(sql).not.toMatch(/\bGRANT\b|\bREVOKE\b/);
    expect(sql).not.toMatch(/(UPDATE|INSERT INTO|DELETE FROM|TRUNCATE|DROP TABLE) _mudelar_excel\./);
    expect(sql).toContain("SELECT coalesce(n.nspacl::text, '') INTO v_acl");
    expect(sql).toContain("SELECT coalesce(c.relacl::text, '') INTO v_acl");
    expect(sql).toContain("c.relkind::text = 'r'");
  });

  it("guardas antes da escrita, conferências depois", () => {
    const escrita = sql.indexOf("UPDATE products p SET");
    expect(escrita).toBeGreaterThan(0);
    const semOrg = sql.indexOf("não existe nesta base — nada a fazer.', c_org; RETURN;");
    const semCopia = sql.indexOf("não existe nesta base — nada a fazer.'; RETURN;");
    const jaAplicada = sql.indexOf("RAISE NOTICE 'mudelar_excel_onda4b: já aplicada");
    expect(semOrg).toBeGreaterThan(0);
    expect(semCopia).toBeGreaterThan(semOrg);
    expect(jaAplicada).toBeGreaterThan(semCopia);
    expect(jaAplicada).toBeLessThan(escrita);
    for (const g of ["L1: a lista não tem", "mudelar_excel_onda4b: estado a meio", "G1: a Mudelar tem % produtos vivos",
      "G1: a Mudelar tem % consumíveis", "G1: a Mudelar tem % famílias", "G2: só % de % produtos", "G2: % produtos ganharam",
      "G3: só % de % ligações", "G3: os produtos têm", "G4: o fornecedor", "G5: o utilizador", "G5: app.audit_bypass"]) {
      const i = sql.indexOf(`RAISE EXCEPTION '${g}`);
      expect(i, g).toBeGreaterThan(0);
      expect(i, g).toBeLessThan(escrita);
    }
    expect(sql.indexOf("RAISE NOTICE 'mudelar_excel_onda4b: % produtos NÃO repostos")).toBeLessThan(escrita);
    for (const w of ["W1: %", "W2: %", "W2: app.audit_bypass", "C1: % produtos", "C1: % ligações", "C2: há SKU", "C3: mudaram",
      "C3: % dos produtos", "C3: a Mudelar ficou", "C4: mudaram preços", "C4: mudaram atributos", "C4: mudaram códigos", "C5: mudaram",
      "C5: a Mudelar ficou", "C6: a Mudelar ficou", "C7: a Mudelar ficou", "C7: as famílias", "C8: mudaram", "C9: %", "C10: o schema",
      "C10: % ficou", "C12: % linhas de auditoria dos produtos", "C12: % linhas de auditoria das ligações", "C12: % linhas de auditoria destes"]) {
      expect(sql.indexOf(`RAISE EXCEPTION '${w}`), w).toBeGreaterThan(escrita);
    }
    expect(sql).toContain("PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));");
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(escrita);
    expect(sql).toContain("ORDER BY p.id FOR NO KEY UPDATE;");
    expect(sql).toContain("ORDER BY i.id FOR NO KEY UPDATE;");
    // o estado exato da onda 4, intacto desde então, e o total final (32147 + os repostos)
    expect(sql).toContain("p.deleted_at = b.arquivado_em AND p.updated_at = b.arquivado_em");
    expect(sql).toContain("i.deleted_at = bp.arquivado_em AND i.updated_at = bp.arquivado_em");
    expect(sql).toContain("IF v_n <> c_n_mudelar + v_repor THEN");
    expect(sql).toContain("(to_jsonb(p) - 'updated_at') IS DISTINCT FROM (b.linha - 'updated_at')");
  });

  it("as impressões digitais não usam updated_at e comparam-se antes e depois", () => {
    for (const h of ["sku", "out", "preco", "isup", "attr", "cod", "fam", "docs"]) {
      expect(sql).toContain(`v_h_${h}_depois <> v_h_${h}_antes`);
      expect(sql.match(new RegExp(`INTO v_h_${h}_(antes|depois)`, "g"))).toHaveLength(2);
    }
    expect(sql.match(/FROM negocio_vista_cliente t WHERE t\.organization_id = c_org\) z;/g)).toHaveLength(2);
  });

  it("os RAISE com % têm tantos argumentos como %", () => {
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

  it("nenhuma reversão na pasta das migrations e nenhum carimbo repetido", () => {
    expect(readdirSync(pasta).filter((f) => /reverter/i.test(f) && /mudelar|onda4/i.test(f))).toEqual([]);
    expect(readdirSync(pasta).filter((f) => /mudelar_excel_onda4b/.test(f))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270129850000_"))).toHaveLength(1);
  });
});
