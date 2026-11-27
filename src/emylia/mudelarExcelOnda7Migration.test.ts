/**
 * @vitest-environment node
 */
// 27/11: a migration de DADOS «Mudelar igual aos Excels», onda 7 (20270130000000: o IVA do Excel nas 12 placas de
// acionamento, os 5 nomes com o código do fabricante, apagar as 27 medidas que a onda 6 deu aos tampos NNNx4x46 e arquivar
// o repetido MACBML0162), lida como TEXTO. Confere o que se pode conferir sem a correr: as listas embutidas, que só escreve
// vat_rate, name, as 27 medidas e o arquivo (nada de SKU, estado, subcategoria, modelo, preços nem famílias), guardas antes
// da escrita e conferências depois, os RAISE com tantos % como argumentos e que a reversão não está na pasta das migrations.
// Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270130000000_mudelar_excel_onda7.sql";
const caminho = resolve(pasta, nome);
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");
const onda6 = readFileSync(resolve(pasta, "20270129900000_mudelar_excel_onda6_atributos.sql"), "utf8");

const ORG = "3242e925-da26-459a-8258-be04d904e355";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const constante = (n: string): number => Number((sql.match(new RegExp(`${n} constant integer := (\\d+);`)) ?? [])[1]);
const lista = (t: string): string => bruto.slice(bruto.indexOf(`INSERT INTO ${t} `), bruto.indexOf(";", bruto.indexOf(`INSERT INTO ${t} `)));

const iva = [...lista("_o7_iva").matchAll(new RegExp(`\\('(${UUID})', '(${UUID})', '([^']+)', '(purchase|retail)', ([\\d.]+), (\\d+), (\\d+), '([^']+)'\\)`, "g"))]
  .map((m) => ({ id: m[1], pid: m[2], sku: m[3], tipo: m[4], de: Number(m[6]), para: Number(m[7]), linha: m[8] }));
const nomes = [...lista("_o7_nome").matchAll(new RegExp(`\\('(${UUID})', '([^']+)', '((?:[^']|'')*)', '((?:[^']|'')*)', '([^']+)'\\)`, "g"))]
  .map((m) => ({ id: m[1], sku: m[2], de: m[3], para: m[4], linha: m[5] }));
const attrs = [...lista("_o7_attr").matchAll(new RegExp(`\\('(${UUID})', '(${UUID})', '([^']+)'\\)`, "g"))]
  .map((m) => ({ id: m[1], pid: m[2], sku: m[3] }));
const arq = [...lista("_o7_arq").matchAll(new RegExp(`\\('(${UUID})', '([^']+)', '(${UUID})', '([^']+)', '(${UUID})'\\)`, "g"))]
  .map((m) => ({ id: m[1], sku: m[2], fica: m[4], isup: m[5] }));

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz a base, a organização, o pedido, o que não faz, os gatilhos, a ordem e a reversão", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain(`SÓ A MUDELAR (${ORG})`);
    expect(bruto).toContain("os 12 com esse ivva metes");
    expect(bruto).toContain("O QUE NÃO FAZ: não muda SKU");
    expect(bruto).toContain("as bases de duche ficam ATIVAS");
    expect(bruto).toContain("NÃO entram os outros 422 produtos");
    expect(bruto).toContain("fora_iva_sem_preco.csv");
    expect(bruto).toContain("fora_pares.csv");
    for (const g of ["log_product_price_change", "fn_audit_product_prices", "fn_generic_entity_audit",
      "fn_audit_product_attribute_values", "fn_item_suppliers_sync_preferred"]) expect(bruto, g).toContain(g);
    expect(bruto).toContain("depois de 20270129900000");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("REVERSÃO fora da pasta das migrations");
    expect(bruto).toContain("A REVERSÃO DA ONDA 6 (mudelar-reverter-onda6.sql) passa a abortar");
  });

  it("uma só transação: BEGIN, SET LOCAL dos tempos e COMMIT no fim", () => {
    expect(sql).toMatch(/^ ?BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '5min';/);
    expect(sql.trim().endsWith("END $mig$; COMMIT;")).toBe(true);
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
  });

  it("A: as 24 linhas de preço (compra e PVP) das 12 placas, de 23 para o IVA do Excel (24 a 32)", () => {
    expect(iva).toHaveLength(24);
    expect(constante("c_n_iva")).toBe(24);
    expect(constante("c_n_iva_prod")).toBe(12);
    expect(new Set(iva.map((x) => x.id)).size).toBe(24);
    expect(new Set(iva.map((x) => x.pid)).size).toBe(12);
    for (const x of iva) {
      expect(x.de, x.sku).toBe(23);
      expect(x.para, x.sku).toBeGreaterThanOrEqual(24);
      expect(x.para, x.sku).toBeLessThanOrEqual(32);
      expect(x.sku, x.sku).toMatch(/^LS-KS-000[234]-/);
      expect(x.linha).toMatch(/^LSKS000[234]/);
    }
    // cada produto tem uma linha de compra e uma de PVP, com o mesmo IVA
    const porProduto = new Map<string, typeof iva>();
    for (const x of iva) porProduto.set(x.pid, [...(porProduto.get(x.pid) ?? []), x]);
    for (const [, xs] of porProduto) {
      expect(xs.map((x) => x.tipo).sort()).toEqual(["purchase", "retail"]);
      expect(new Set(xs.map((x) => x.para)).size).toBe(1);
    }
    const porLinha = Object.fromEntries(iva.filter((x) => x.tipo === "retail").map((x) => [x.linha, x.para]));
    expect(porLinha).toEqual({
      LSKS0002PM: 24, LSKS0003CR: 25, LSKS0003RG: 26, LSKS0003GM: 27, LSKS0003PM: 28, LSKS0003OR: 29, LSKS0003DM: 30,
      LSKS0004BM: 31, LSKS0004CR: 32, LSKS0004PM: 32, LSKS0004PG: 32, LSKS0004OR: 32,
    });
  });

  it("B: os 5 nomes passam a ser os do Excel, com o código do fabricante", () => {
    expect(constante("c_n_nome")).toBe(5);
    expect(nomes.map((n) => [n.sku, n.para])).toEqual([
      ["EL-MLL-0001-45", "MÁQUINA DE LAVAR LOUÇA BALAY - 3VT4031NA - 45CM"],
      ["EL-MLL-0004-45", "Máquina lavar loiça INDESIT 45CM- IN2FD10CS70W"],
      ["EL-PL-0001-80", "PLACA COM EXAUSTOR INTGRADO AEG - TH84CB03FB 80CM"],
      ["MCC-AC-0018-528X545MM", "ESTRUTURA LAUNDRY CARRIER 500 940TUL0000004 3270821 2X33L 528MM ALT 545MM ANTRACITE"],
      ["TM-MMG-0002-GRF", "Misturadoras Monocomando Giratoria SOPHIE Metal Edition Grafite (cod. GN)"],
    ]);
    for (const n of nomes) expect(n.para.length, n.sku).toBeGreaterThan(n.de.length);
    // não mexe nos «Perfil Acessorio» nem nos «Resguardo Resguardo»
    expect(lista("_o7_nome")).not.toMatch(/Perfil Acessorio|Resguardo Resguardo/);
  });

  it("C: as 27 medidas dos tampos NNNx4x46, todos produtos que a onda 6 tocou com um só atributo", () => {
    expect(attrs).toHaveLength(27);
    expect(constante("c_n_attr")).toBe(27);
    expect(new Set(attrs.map((a) => a.id)).size).toBe(27);
    expect(new Set(attrs.map((a) => a.pid)).size).toBe(27);
    for (const a of attrs) {
      expect(a.sku).toMatch(/^MACBTB000[24]\d{2,3}X4X46(-LB|-ME)?$/);
      expect(onda6, a.sku).toContain(`('${a.pid}', '${a.sku}', 1)`);
    }
    // só as linhas que a onda 6 inseriu, ainda iguais à cópia dela
    expect(sql).toContain("JOIN _mudelar_excel.onda6_atributos_novos n ON n.id = x.id");
    expect(sql).toContain("to_jsonb(v) = n.linha");
  });

  it("D: só o par igual (MACBML0161 fica, MACBML0162 arquiva); os outros 3 pares não entram", () => {
    expect(constante("c_n_arq")).toBe(1);
    expect(arq.map((a) => [a.sku, a.fica])).toEqual([["MACBML0162", "MACBML0161"]]);
    expect(lista("_o7_arq")).not.toMatch(/DBRS0255|MACBML014[56]|MACBML015[23]/);
    expect(sql).toContain("(to_jsonb(a) - ARRAY['id', 'sku', 'updated_at']) = (to_jsonb(k) - ARRAY['id', 'sku', 'updated_at'])");
  });

  it("as contagens de partida são as lidas a 27/11", () => {
    expect(constante("c_n_mudelar")).toBe(32150);
    expect(constante("c_n_cons")).toBe(145);
    expect(constante("c_n_fam")).toBe(548);
    expect(constante("c_n_membros")).toBe(14637);
  });

  it("escreve só vat_rate, name, as 27 medidas e o arquivo; nada de SKU, estado, subcategoria, modelo, preço nem famílias", () => {
    const corpo = sql.slice(sql.indexOf("DO $mig$"));
    const updates = [...corpo.matchAll(/\bUPDATE (\w+) (\w+ )?SET ([^;]*?) (?:WHERE|FROM)/g)].map((m) => [m[1], m[3]]);
    expect(updates).toEqual([
      ["product_prices", "vat_rate = x.para"],
      ["products", "name = x.para"],
      ["products", "is_deleted = true, deleted_at = now(), deleted_by = c_criador"],
      ["item_suppliers", "deleted_at = now(), deleted_by = c_criador, updated_at = now()"],
    ]);
    expect([...sql.matchAll(/DELETE FROM ([\w.]+)/g)].map((m) => m[1])).toEqual(["product_attribute_values"]);
    expect(corpo).toContain("DELETE FROM product_attribute_values v USING _o7_attr x WHERE v.id = x.id AND v.product_id = x.product_id;");
    expect([...sql.matchAll(/INSERT INTO ([\w.]+)/g)].map((m) => m[1])).toEqual([
      "_o7_iva", "_o7_nome", "_o7_attr", "_o7_arq",
      "_mudelar_excel.onda7_precos", "_mudelar_excel.onda7_produtos", "_mudelar_excel.onda7_atributos", "_mudelar_excel.onda7_item_suppliers",
    ]);
    expect(sql).not.toMatch(/cat_gerar_sku_produto\s*\(|rpc_\w+\s*\(/);
    expect(sql).not.toMatch(/SET (sku|status|subcategory_id|model_id|price|supplier_id)\b/);
    expect(sql).not.toMatch(/(product_family_members|product_families|product_codes|product_price_history) (\w+ )?SET\b/);
    expect(sql).not.toMatch(/(quote_lines|negocio_produtos|purchase_order_items|negocio_vista_cliente|service_materials|stock_movements) (\w+ )?SET\b/);
    // a auditoria dos gatilhos desliga-se só à volta do arquivo, que tem as duas linhas manuais
    const on = corpo.indexOf("set_config('app.audit_bypass', 'on', true)"), off = corpo.indexOf("set_config('app.audit_bypass', 'off', true)");
    expect(corpo.match(/set_config\('app\.audit_bypass', 'on', true\)/g)).toHaveLength(1);
    expect(corpo.indexOf("UPDATE product_prices pp SET")).toBeLessThan(on);
    expect(corpo.indexOf("UPDATE products p SET name")).toBeLessThan(on);
    expect(corpo.indexOf("DELETE FROM product_attribute_values")).toBeLessThan(on);
    expect(corpo.indexOf("UPDATE products p SET is_deleted")).toBeGreaterThan(on);
    expect(corpo.indexOf("UPDATE item_suppliers i SET")).toBeLessThan(off);
    expect(corpo.match(/PERFORM fn_manual_audit_log\('(products|item_suppliers)'/g)).toHaveLength(2);
  });

  it("o DDL são as temporárias e a cópia fechada no schema privado; nenhum GRANT", () => {
    const ddl = [...sql.matchAll(/(?:^|;|\bTHEN|\bLOOP)\s*((?:CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT)\b[^;(]*)/gi)].map((m) => m[1].trim());
    expect(ddl).toEqual([
      "CREATE TEMP TABLE _o7_iva", "CREATE TEMP TABLE _o7_nome", "CREATE TEMP TABLE _o7_attr", "CREATE TEMP TABLE _o7_arq",
      "CREATE SCHEMA IF NOT EXISTS _mudelar_excel",
      "REVOKE ALL ON SCHEMA _mudelar_excel FROM PUBLIC, anon, authenticated, service_role",
      "CREATE TABLE _mudelar_excel.onda7_precos", "CREATE TABLE _mudelar_excel.onda7_produtos",
      "CREATE TABLE _mudelar_excel.onda7_atributos", "CREATE TABLE _mudelar_excel.onda7_item_suppliers",
      "REVOKE ALL ON ALL TABLES IN SCHEMA _mudelar_excel FROM PUBLIC, anon, authenticated, service_role",
    ]);
    expect(sql).not.toMatch(/\bGRANT\b/);
    expect(sql).not.toMatch(/(UPDATE|DELETE FROM|TRUNCATE|DROP TABLE) _mudelar_excel\./);
    expect(sql).toContain("SELECT coalesce(n.nspacl::text, '') INTO v_acl");
    expect(sql).toContain("SELECT coalesce(c.relacl::text, '') INTO v_acl");
    expect(sql).toContain("c.relkind::text = 'r'");
  });

  it("guardas antes da escrita (e da cópia), conferências depois", () => {
    const copia = sql.indexOf("CREATE SCHEMA IF NOT EXISTS _mudelar_excel");
    const escrita = sql.indexOf("UPDATE product_prices pp SET");
    expect(copia).toBeGreaterThan(0);
    expect(escrita).toBeGreaterThan(copia);
    const semOrg = sql.indexOf("não existe nesta base — nada a fazer.', c_org; RETURN;");
    const semOnda6 = sql.indexOf("não existe nesta base — nada a fazer.'; RETURN;");
    const jaAplicada = sql.indexOf("RAISE NOTICE 'mudelar_excel_onda7: já aplicada");
    expect(semOrg).toBeGreaterThan(0);
    expect(semOnda6).toBeGreaterThan(semOrg);
    expect(jaAplicada).toBeGreaterThan(semOnda6);
    expect(jaAplicada).toBeLessThan(copia);
    for (const g of ["L1: as listas", "L1: % produtos", "mudelar_excel_onda7: estado a meio", "G1: a Mudelar tem % produtos vivos",
      "G1: a Mudelar tem % consumíveis", "G1: a Mudelar tem % famílias", "G2: só % de % linhas", "G2: os % produtos", "G3: só %",
      "G4: só %", "G5: só % de % pares", "G5: o arquivado", "G5: o produto a arquivar", "G6: o utilizador", "G6: app.audit_bypass"]) {
      const i = sql.indexOf(`RAISE EXCEPTION '${g}`);
      expect(i, g).toBeGreaterThan(0);
      expect(i, g).toBeLessThan(copia);
    }
    for (const w of ["W1: %", "W2: %", "W3: %", "W4: % produtos", "W4: % ligações", "W4: app.audit_bypass", "C1: % de % linhas de preço",
      "C1: % de % produtos ficaram", "C1: os tampos", "C1: % de % produtos arquivados", "C1: % de % ligações", "C1: % de % produtos que ficam",
      "C2: há SKU", "C3: mudaram", "C3: a Mudelar ficou", "C4: mudaram preços", "C4: mudaram códigos", "C5: mudaram", "C5: a Mudelar ficou",
      "C6: mudaram", "C6: a Mudelar ficou", "C7: a Mudelar ficou", "C8: a Mudelar ficou", "C8: as famílias", "C9: mudaram", "C10: %",
      "C11: o schema", "C11: % ficou", "C12: % linhas de auditoria de preços", "C12: % linhas de auditoria de nomes",
      "C12: % linhas de auditoria de atributos", "C12: % linhas de auditoria do arquivo", "C12: % linhas de auditoria nesta"]) {
      expect(sql.indexOf(`RAISE EXCEPTION '${w}`), w).toBeGreaterThan(escrita);
    }
    expect(sql).toContain("PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));");
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(copia);
    expect(sql).toContain("ORDER BY p.id FOR NO KEY UPDATE;");
    expect(sql).toContain("ORDER BY i.id FOR NO KEY UPDATE;");
    expect(sql).toContain("IF v_n <> c_n_mudelar - c_n_arq OR v_m <> v_arq_antes + c_n_arq THEN");
    expect(sql).toContain("IF v_n <> v_attr_total - c_n_attr THEN");
    expect(sql).toContain("IF v_n <> v_isup_vivas - c_n_arq THEN");
  });

  it("as impressões digitais não usam updated_at, deixam de fora só o que esta onda escreve e comparam-se antes e depois", () => {
    for (const h of ["sku", "out", "preco", "isup", "attr", "cod", "fam", "docs"]) {
      expect(sql).toContain(`v_h_${h}_depois <> v_h_${h}_antes`);
      expect(sql.match(new RegExp(`INTO v_h_${h}_(antes|depois)`, "g"))).toHaveLength(2);
    }
    expect(sql.match(/AND p\.id NOT IN \(SELECT x\.id FROM _o7_nome x UNION SELECT x\.id FROM _o7_arq x\)/g)).toHaveLength(2);
    expect(sql.match(/AND pp\.id NOT IN \(SELECT x\.id FROM _o7_iva x\)/g)).toHaveLength(2);
    expect(sql.match(/AND v\.id NOT IN \(SELECT x\.id FROM _o7_attr x\)/g)).toHaveLength(2);
    expect(sql.match(/AND i\.id NOT IN \(SELECT x\.isup_id FROM _o7_arq x\)/g)).toHaveLength(2);
    expect(sql.match(/FROM negocio_vista_cliente t WHERE t\.organization_id = c_org\) z;/g)).toHaveLength(2);
  });

  it("os RAISE com % têm tantos argumentos como %", () => {
    const raises = [...sql.matchAll(/RAISE (?:EXCEPTION|NOTICE|WARNING) '((?:[^']|'')*)'([^;]*);/g)];
    expect(raises.length).toBeGreaterThan(40);
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
    expect(readdirSync(pasta).filter((f) => /reverter/i.test(f) && /mudelar|onda7/i.test(f))).toEqual([]);
    expect(readdirSync(pasta).filter((f) => /mudelar_excel_onda7/.test(f))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270130000000_"))).toHaveLength(1);
    // é a última migration da pasta (o carimbo é maior do que o da onda 6)
    expect(readdirSync(pasta).filter((f) => /^\d{14}_/.test(f)).sort().at(-1)).toBe(nome);
  });
});
