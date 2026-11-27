/**
 * @vitest-environment node
 */
// 26/11: a migration de DADOS «Mudelar igual aos Excels», onda 4 (20270129800000: arquivar os produtos da Mudelar que não
// estão em nenhum Excel), lida como TEXTO. Confere o que se pode conferir sem a correr: as listas embutidas (ids e SKU únicos,
// contagens iguais às constantes, nenhuma exceção do dono lá dentro), que só ARQUIVA (UPDATE de is_deleted/deleted_at/deleted_by
// em products e de deleted_at/deleted_by em item_suppliers, nada de DELETE, INSERT fora da cópia, famílias, SKU nem documentos),
// guardas antes da escrita e conferências depois, os RAISE com tantos % como argumentos e que a reversão não está na pasta das
// migrations. Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270129800000_mudelar_excel_onda4.sql";
const caminho = resolve(pasta, nome);
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

const ORG = "3242e925-da26-459a-8258-be04d904e355";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function secao(de: string, ate: string): string {
  const i = bruto.indexOf(de), j = bruto.indexOf(ate, i + de.length);
  return i < 0 || j < 0 ? "" : bruto.slice(i, j);
}
const constante = (n: string): number => Number((sql.match(new RegExp(`${n} constant integer := (\\d+);`)) ?? [])[1]);

const prods = [...secao("INSERT INTO _o4_prod", "CREATE TEMP TABLE _o4_isup").matchAll(new RegExp(`\\('(${UUID})', '((?:[^']|'')*)', (true|false)\\)`, "g"))]
  .map((m) => ({ id: m[1], sku: m[2].replace(/''/g, "'"), comRefs: m[3] === "true" }));
const isup = [...secao("INSERT INTO _o4_isup", "DO $mig$").matchAll(new RegExp(`\\('(${UUID})', '(${UUID})'\\)`, "g"))]
  .map((m) => ({ id: m[1], produto: m[2] }));

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz a base, a organização, o pedido, o que não faz, as exceções, a ordem e a reversão", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain(`SÓ A MUDELAR (${ORG})`);
    expect(bruto).toContain("«men so faz que teja tudo como nos excels sf»");
    expect(bruto).toContain("O QUE NÃO FAZ: não apaga nada (nenhum DELETE), não muda SKU");
    expect(bruto).toContain("não reaponta nem altera orçamentos");
    expect(bruto).toContain("não toca em");
    expect(bruto).toContain("EXCEÇÕES à letra do Excel");
    expect(bruto).toContain("consumivel CONS-");
    expect(bruto).toContain("ACB-T-0013-B");
    expect(bruto).toContain("depois de 20270129700000");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("REVERSÃO fora da pasta das migrations");
    expect(bruto).toContain("fn_products_barcode_guard");
  });

  it("uma só transação: BEGIN, SET LOCAL dos tempos e COMMIT no fim", () => {
    expect(sql).toMatch(/^ ?BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '5min';/);
    expect(sql.trim().endsWith("END $mig$; COMMIT;")).toBe(true);
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
  });

  it("as listas têm os números das constantes, ids e SKU únicos, e cada ligação é de um produto da lista", () => {
    expect(prods).toHaveLength(constante("c_n_produtos"));
    expect(prods.length).toBe(180);
    expect(prods.filter((p) => p.comRefs)).toHaveLength(constante("c_n_com_refs"));
    expect(prods.filter((p) => !p.comRefs)).toHaveLength(constante("c_n_sem_refs"));
    expect(new Set(prods.map((p) => p.id)).size).toBe(prods.length);
    expect(new Set(prods.map((p) => p.sku)).size).toBe(prods.length);
    expect(isup).toHaveLength(constante("c_n_isup"));
    expect(isup.length).toBe(173);
    expect(new Set(isup.map((i) => i.id)).size).toBe(isup.length);
    expect(new Set(isup.map((i) => i.produto)).size).toBe(isup.length);
    const ids = new Set(prods.map((p) => p.id));
    for (const i of isup) expect(ids.has(i.produto), i.id).toBe(true);
    expect(constante("c_n_mudelar")).toBe(32327);
    expect(constante("c_n_fam")).toBe(548);
    expect(constante("c_n_membros")).toBe(14637);
  });

  it("as exceções do dono ficam fora da lista: consumíveis, o produto da família, as renomeações por resolver e as encomendas por receber", () => {
    const skus = new Set(prods.map((p) => p.sku));
    for (const p of prods) expect(p.sku, p.id).not.toMatch(/^CONS-/);
    for (const s of ["ACB-T-0013-B", "EL-FRG-0008", "EL-FRG-0001", "DBBD0010", "DBCD0001", "DBR0010", "DB-RD-0512-NG-140145"]) {
      expect(skus.has(s), s).toBe(false);
    }
    // os 7 CAT/TESTE sem referências saem (não estão no Excel nem em receitas)
    expect(prods.filter((p) => /^(CAT-|TESTE)/.test(p.sku) && !p.comRefs)).toHaveLength(7);
  });

  it("só ARQUIVA: UPDATE de products (os três campos) e de item_suppliers; nada de DELETE, INSERT fora da cópia, SKU, famílias nem documentos", () => {
    const corpo = sql.slice(sql.indexOf("DO $mig$"));
    const updates = [...corpo.matchAll(/\bUPDATE (\w+) (\w+ )?SET ([^;]*?) WHERE/g)].map((m) => [m[1], m[3]]);
    expect(updates).toEqual([
      ["products", "is_deleted = true, deleted_at = now(), deleted_by = c_criador"],
      ["item_suppliers", "deleted_at = now(), deleted_by = c_criador, updated_at = now()"],
    ]);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    const inserts = [...corpo.matchAll(/INSERT INTO ([\w.]+)/g)].map((m) => m[1]);
    expect(inserts).toEqual(["_mudelar_excel.onda4_produtos", "_mudelar_excel.onda4_item_suppliers"]);
    expect(sql).not.toMatch(/cat_gerar_sku_produto\s*\(|rpc_delete_product\s*\(|rpc_bulk_delete_product\s*\(/);
    expect(sql).not.toMatch(/(product_family_members|product_families|product_codes|product_prices|product_attribute_values) (\w+ )?SET\b/);
    expect(sql).not.toMatch(/(quote_lines|negocio_produtos|purchase_order_items|negocio_vista_cliente|service_materials|stock_movements) (\w+ )?SET\b/);
    // a auditoria dos gatilhos desliga-se só à volta das duas escritas, e cada uma tem a linha manual das RPC
    const on = corpo.indexOf("set_config('app.audit_bypass', 'on', true)"), off = corpo.indexOf("set_config('app.audit_bypass', 'off', true)");
    expect(on).toBeGreaterThan(0);
    expect(corpo.indexOf("UPDATE products p SET")).toBeGreaterThan(on);
    expect(corpo.indexOf("UPDATE item_suppliers i SET")).toBeLessThan(off);
    expect(corpo.match(/set_config\('app\.audit_bypass', 'on', true\)/g)).toHaveLength(1);
    expect(corpo.match(/PERFORM fn_manual_audit_log\('(products|item_suppliers)'/g)).toHaveLength(2);
    expect(corpo).toContain("AND NOT p.is_deleted AND p.deleted_at IS NULL;");
  });

  it("o único DDL é a cópia no schema privado _mudelar_excel (e as temporárias), fechada a PUBLIC, anon, authenticated e service_role", () => {
    const ddl = [...sql.matchAll(/(?:^|;|\bTHEN|\bLOOP)\s*((?:CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT)\b[^;(]*)/gi)].map((m) => m[1].trim());
    for (const d of ddl) expect(d).toMatch(/^(CREATE TEMP TABLE _o4_\w+$|CREATE SCHEMA IF NOT EXISTS _mudelar_excel$|CREATE TABLE _mudelar_excel\.onda4_\w+$|REVOKE ALL ON (SCHEMA|ALL TABLES IN SCHEMA) _mudelar_excel FROM PUBLIC, anon, authenticated, service_role$)/);
    expect(ddl.filter((d) => d.startsWith("REVOKE"))).toHaveLength(2);
    expect(sql).not.toMatch(/\bGRANT\b/);
    const temp = [...sql.matchAll(/CREATE TEMP TABLE (\w+) \([^;]*\) ON COMMIT DROP;/g)].map((m) => m[1]);
    expect(temp).toEqual(["_o4_prod", "_o4_isup"]);
    const copias = [...sql.matchAll(/CREATE TABLE _mudelar_excel\.(onda4_\w+)/g)].map((m) => m[1]);
    expect(copias).toEqual(["onda4_produtos", "onda4_item_suppliers"]);
    expect(sql.indexOf("REVOKE ALL ON ALL TABLES IN SCHEMA")).toBeGreaterThan(sql.indexOf("CREATE TABLE _mudelar_excel.onda4_item_suppliers"));
    expect(sql).toContain("SELECT coalesce(n.nspacl::text, '') INTO v_acl");
    expect(sql).toContain("SELECT coalesce(c.relacl::text, '') INTO v_acl");
    expect(sql).toContain("c.relkind::text = 'r'");
  });

  it("guardas antes da cópia e da escrita, conferências depois", () => {
    const copia = sql.indexOf("CREATE SCHEMA IF NOT EXISTS _mudelar_excel");
    const escrita = sql.indexOf("UPDATE products p SET");
    expect(copia).toBeGreaterThan(0);
    expect(escrita).toBeGreaterThan(copia);
    const semOrg = sql.indexOf("não existe nesta base — nada a fazer.', c_org; RETURN;");
    const jaAplicada = sql.indexOf("RAISE NOTICE 'mudelar_excel_onda4: já aplicada");
    expect(semOrg).toBeGreaterThan(0);
    expect(jaAplicada).toBeGreaterThan(semOrg);
    expect(jaAplicada).toBeLessThan(copia);
    for (const g of ["L1: a lista não tem", "L1: a lista de ligações", "mudelar_excel_onda4: estado a meio", "G1: a Mudelar tem % produtos vivos",
      "G1: a Mudelar tem % famílias", "G2: só % de % produtos", "G2: % produtos ganharam", "G3: % linhas de documentos", "G3: % referências",
      "G4: % de % ligações", "G5: o utilizador", "G5: app.audit_bypass", "G6: %"]) {
      const i = sql.indexOf(`RAISE EXCEPTION '${g}`);
      expect(i, g).toBeGreaterThan(0);
      expect(i, g).toBeLessThan(copia);
    }
    for (const w of ["B1: % produtos", "B1: % ligações"]) expect(sql.indexOf(`RAISE EXCEPTION '${w}`), w).toBeGreaterThan(copia);
    for (const w of ["W1: %", "W2: %", "W2: app.audit_bypass"]) expect(sql.indexOf(`RAISE EXCEPTION '${w}`), w).toBeGreaterThan(escrita);
    for (const c of ["C1: % produtos", "C1: % ligações", "C2: há SKU", "C3: mudaram", "C3: a Mudelar ficou", "C4: mudaram preços",
      "C4: mudaram atributos", "C4: mudaram códigos", "C5: mudaram", "C5: a Mudelar ficou", "C7: a Mudelar ficou", "C7: as famílias",
      "C7: % combinações", "C8: mudaram", "C9: %", "C10: o schema", "C10: % ficou", "C12: % linhas de auditoria dos produtos",
      "C12: % linhas de auditoria das ligações", "C12: % linhas de auditoria destes"]) {
      expect(sql.indexOf(`RAISE EXCEPTION '${c}`), c).toBeGreaterThan(escrita);
    }
    expect(sql).toContain("PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));");
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(copia);
    expect(sql).toContain("ORDER BY p.id FOR NO KEY UPDATE;");
  });

  it("a exceção 2 do dono fica na base: só se arquiva se o nome estiver guardado nos documentos", () => {
    for (const c of ["coalesce(btrim(t.descricao_snapshot), '') = ''", "coalesce(btrim(t.nome), '') = ''", "coalesce(btrim(t.description), '') = ''"]) {
      expect(sql, c).toContain(c);
    }
    expect(sql).toContain("strpos(t.vista::text, x.id::text) > 0");
    expect(sql).toContain("po.status::text NOT IN ('received', 'cancelled')");
  });

  it("as impressões digitais não usam updated_at e comparam-se antes e depois (com a vista do cliente)", () => {
    expect(sql.match(/md5\(\(to_jsonb\(p\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(pp\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(i\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(v\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/FROM negocio_vista_cliente t WHERE t\.organization_id = c_org\) z;/g)).toHaveLength(2);
    for (const h of ["sku", "out", "preco", "isup", "attr", "cod", "fam", "docs"]) expect(sql).toContain(`v_h_${h}_depois <> v_h_${h}_antes`);
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
    expect(readdirSync(pasta).filter((f) => /reverter-onda|reverter_onda|mudelar_excel.*reverter/i.test(f))).toEqual([]);
    expect(readdirSync(pasta).filter((f) => /mudelar_excel_onda4\.sql$/.test(f))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270129800000_"))).toHaveLength(1);
  });
});
