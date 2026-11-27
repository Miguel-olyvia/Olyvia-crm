/**
 * @vitest-environment node
 */
// 26/11: a migration de DADOS «Mudelar igual aos Excels», onda 3 (20270129700000: criar os produtos do Excel que não existem
// na base), lida como TEXTO. Confere o que se pode conferir sem a correr: as listas embutidas (ids e SKU únicos, contagens
// iguais às constantes, SKU do Excel fora do formato numerado, estados, preços e IVA válidos, referências resolvidas), que só
// INSERE produtos, preços, ligações a fornecedores e à organização (nada de UPDATE, DELETE, atributos, famílias, gerar SKU nem
// documentos), guardas antes da escrita e conferências depois, a lista fechada, os RAISE com tantos % como argumentos e que a
// reversão não está na pasta das migrations. Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270129700000_mudelar_excel_onda3.sql";
const caminho = resolve(pasta, nome);
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

const ORG = "3242e925-da26-459a-8258-be04d904e355";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** Um literal de texto, normal ou E'…' (com \r, \n e \\ escapados). */
const TEXTO = "E?'((?:[^'\\\\]|''|\\\\.)*)'";
const NUM = "(-?\\d+(?:\\.\\d+)?)";
const des = (s: string | undefined): string | null =>
  s === undefined ? null : s.replace(/''/g, "'").replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
const optN = (s: string | undefined): number | null => (s === undefined ? null : Number(s));

/** O pedaço do ficheiro entre dois marcadores (as linhas de VALUES de cada tabela temporária). */
function secao(de: string, ate: string): string {
  const i = bruto.indexOf(de), j = bruto.indexOf(ate, i + de.length);
  return i < 0 || j < 0 ? "" : bruto.slice(i, j);
}
const constante = (n: string): number => Number((sql.match(new RegExp(`${n} constant integer := (\\d+);`)) ?? [])[1]);

const refs = [...secao("INSERT INTO _o3_ref", "CREATE TEMP TABLE _o3_prod").matchAll(new RegExp(`\\('(cat|sub|marca|forn|uom)', (\\d+), '(${UUID})'\\)`, "g"))]
  .map((m) => ({ tipo: m[1], n: Number(m[2]), id: m[3] }));
const OPT_I = "(NULL|\\d+)", OPT_N = `(?:NULL|${NUM})`, OPT_T = `(?:NULL|${TEXTO})`;
const prods = [...secao("INSERT INTO _o3_prod", "DO $mig$").matchAll(new RegExp(
  `\\('(${UUID})', ${TEXTO}, ${TEXTO}, ${OPT_T}, (\\d+), (\\d+), ${OPT_I}, ${OPT_I}, (\\d+), '(active|draft|discontinued)', (true|false), (true|false), ` +
  `${NUM}, ${OPT_N}, ${OPT_N}, ${OPT_N}, ${OPT_N}, ${OPT_T}, '([A-Z]{3}[xc]:\\d+)'\\)`, "g"))]
  .map((m) => ({
    id: m[1], sku: des(m[2]) as string, nome: des(m[3]) as string, descr: des(m[4]), cat: Number(m[5]), sub: Number(m[6]),
    marca: m[7] === "NULL" ? null : Number(m[7]), forn: m[8] === "NULL" ? null : Number(m[8]), uom: Number(m[9]), estado: m[10],
    vende: m[11] === "true", compra: m[12] === "true", iva: Number(m[13]), pc: optN(m[14]), pv: optN(m[15]), pg: optN(m[16]), pd: optN(m[17]),
    ssku: des(m[18]), excel: m[19],
  }));

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
    expect(bruto).toContain("O QUE NÃO FAZ: não muda nenhum produto que já existe");
    expect(bruto).toContain("não arquiva nem apaga nada");
    expect(bruto).toContain("não reaponta orçamentos");
    expect(bruto).toContain("os novos NÃO entram nas 548 famílias");
    expect(bruto).toContain("EXCEÇÕES à letra do Excel");
    expect(bruto).toContain("criam-se SEM a lista e");
    expect(bruto).toContain("depois de 20270129600000");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("REVERSÃO fora da pasta das migrations");
  });

  it("uma só transação: BEGIN, SET LOCAL dos tempos e COMMIT no fim", () => {
    expect(sql).toMatch(/^ ?BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '5min';/);
    expect(sql.trim().endsWith("END $mig$; COMMIT;")).toBe(true);
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
  });

  it("as listas têm os números das constantes, ids e SKU únicos", () => {
    expect(prods).toHaveLength(constante("c_n_produtos"));
    expect(prods.length).toBe(2317);
    expect(new Set(prods.map((p) => p.id)).size).toBe(prods.length);
    expect(new Set(prods.map((p) => p.sku.toUpperCase())).size).toBe(prods.length);
    expect(prods.filter((p) => p.estado === "active")).toHaveLength(constante("c_n_active"));
    expect(prods.filter((p) => p.estado === "draft")).toHaveLength(constante("c_n_draft"));
    expect(prods.filter((p) => p.estado === "discontinued")).toHaveLength(constante("c_n_discont"));
    expect(prods.filter((p) => p.marca !== null)).toHaveLength(constante("c_n_marca"));
    expect(prods.filter((p) => p.descr !== null)).toHaveLength(constante("c_n_descr"));
    expect(prods.filter((p) => p.pc !== null)).toHaveLength(constante("c_n_p_purchase"));
    expect(prods.filter((p) => p.pv !== null)).toHaveLength(constante("c_n_p_retail"));
    expect(prods.filter((p) => p.pg !== null)).toHaveLength(constante("c_n_p_wholesale"));
    expect(prods.filter((p) => p.pd !== null)).toHaveLength(constante("c_n_p_distrib"));
    expect(prods.reduce((s, p) => s + [p.pc, p.pv, p.pg, p.pd].filter((v) => v !== null).length, 0)).toBe(constante("c_n_preco"));
    expect(prods.filter((p) => p.forn !== null)).toHaveLength(constante("c_n_isup"));
    expect(prods.filter((p) => p.forn !== null && p.ssku !== null)).toHaveLength(constante("c_n_isup_ssku"));
    expect(prods.filter((p) => p.forn !== null && p.pc !== null)).toHaveLength(constante("c_n_isup_pp"));
    expect(constante("c_n_mudelar")).toBe(30010);
    expect(constante("c_n_fam")).toBe(548);
    expect(constante("c_n_membros")).toBe(14637);
  });

  it("as referências: cada número usado existe, um id por (tipo, número), Anlorbel principal e nunca o duplicado", () => {
    const chave = new Set(refs.map((r) => `${r.tipo}:${r.n}`));
    expect(chave.size).toBe(refs.length);
    for (const p of prods) {
      expect(chave.has(`cat:${p.cat}`)).toBe(true);
      expect(chave.has(`sub:${p.sub}`)).toBe(true);
      expect(chave.has(`uom:${p.uom}`)).toBe(true);
      if (p.marca !== null) expect(chave.has(`marca:${p.marca}`)).toBe(true);
      if (p.forn !== null) expect(chave.has(`forn:${p.forn}`)).toBe(true);
    }
    for (const t of ["cat", "sub", "marca", "forn", "uom"]) {
      const ids = refs.filter((r) => r.tipo === t).map((r) => r.id);
      expect(new Set(ids).size, t).toBe(ids.length);
    }
    expect(refs.map((r) => r.id)).toContain("18ebe983-523a-4c8e-9721-ba0d0d1a9662");
    expect(bruto).not.toContain("5fdbcc9c-27e8-4635-b84f-2d4e0b21bf65");
  });

  it("os produtos: SKU do Excel (nunca o formato numerado nem CONS/CAT/TESTE/DEMO), valores válidos, só Móveis WC, Revestimentos e as linhas recentes", () => {
    for (const p of prods) {
      expect(p.sku.trim()).toBe(p.sku);
      expect(p.sku).not.toMatch(/-\d{4}(-|$)/);
      expect(p.sku).not.toMatch(/^(CONS-|CAT-|TESTE)|DEMO/i);
      expect(p.nome.trim()).toBe(p.nome);
      expect(p.nome.length).toBeGreaterThan(0);
      expect(p.nome).not.toMatch(/resguardo\s+resguardo/i);
      expect([0, 6, 13, 23]).toContain(p.iva);
      for (const v of [p.pc, p.pv, p.pg, p.pd]) if (v !== null) expect(v).toBeGreaterThan(0);
      if (p.estado === "active") expect(p.pv).not.toBeNull();
      if (p.ssku !== null) expect(p.forn).not.toBeNull();
      if (p.descr !== null) expect(p.descr.trim().length).toBeGreaterThan(0);
      // a cor é um produto: nenhuma descrição leva uma lista de cores do Atributos
      if (p.descr !== null) expect(p.descr).not.toMatch(/(^|\r\n)(Cor|Tonalidade)[^:\r\n]{0,30}:/);
    }
    // Torneiras: manda a Rev1 (nenhuma linha só de versão antiga); os ficheiros de onde vêm as linhas
    expect(new Set(prods.map((p) => p.excel.split(":")[0]))).toEqual(new Set(["MOVx", "MOVc", "REVc", "RESx", "ELEc", "LAVc"]));
    expect(prods.filter((p) => p.excel.startsWith("MOV"))).toHaveLength(2263);
    expect(prods.filter((p) => p.excel.startsWith("REV"))).toHaveLength(41);
  });

  it("revisão da onda 3: os revestimentos que já existem na base não se criam e nada vai à venda com nome AMBIGUO", () => {
    const skus = new Set(prods.map((p) => p.sku));
    // gémeos (mesma subcategoria e medida) e genéricas de família sem medida com os membros já na base
    for (const s of ["RC0014", "RC0015", "RC0018", "RC0019", "RC0022", "RC0027", "RP0036", "RP0038", "RP0039", "RP0040",
      "RCL0002", "RCL0003", "RCL0004", "RCL0005", "RCL0006", "RCL0007", "RCL0008",
      "RP0016", "RP0017", "RP0018", "RP0020", "RP0024", "RP0027", "RP0028"]) {
      expect(skus.has(s), s).toBe(false);
    }
    // CAPRAIA Natural fica: a base só tem CAPRAIA Polido
    expect(skus.has("RCL0001")).toBe(true);
    for (const p of prods) if (/\bAMBIGUO\b/i.test(p.nome)) expect(p.estado, p.sku).not.toBe("active");
    for (const s of ["DBRS0161CR", "DBRS0162CR", "DBRS0163CR", "DBRS0164CR", "DBRS0165CR", "DBRS0166CR"]) {
      expect(prods.find((p) => p.sku === s)?.estado, s).toBe("draft");
    }
  });

  it("só INSERE (produtos, organização, preços, fornecedores): nada de UPDATE, DELETE, atributos, famílias, gerar SKU nem documentos", () => {
    const corpo = sql.slice(sql.indexOf("DO $mig$"));
    expect(corpo).not.toMatch(/\bUPDATE\s+\w+\s+\w*\s*SET\b/i);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    const inserts = [...corpo.matchAll(/INSERT INTO ([\w.]+)/g)].map((m) => m[1]);
    expect(inserts.filter((t) => !t.startsWith("_mudelar_excel."))).toEqual(["products", "product_organizations", "product_prices", "item_suppliers"]);
    expect(inserts.filter((t) => t.startsWith("_mudelar_excel."))).toEqual(["_mudelar_excel.onda3_produtos",
      "_mudelar_excel.onda3_product_organizations", "_mudelar_excel.onda3_precos", "_mudelar_excel.onda3_item_suppliers"]);
    expect(sql).not.toMatch(/cat_gerar_sku_produto\s*\(|rpc_delete_product|rpc_bulk_delete_product|INSERT INTO product_attribute_values|INSERT INTO product_family/);
    expect(sql).not.toMatch(/INSERT INTO (brands|suppliers|uom|product_categories|service_categories|product_models|attribute_option)/);
    expect(sql).not.toMatch(/(quote_lines|negocio_produtos|purchase_order_items|negocio_vista_cliente|service_materials) (\w+ )?SET\b/);
    // o produto nasce como no Catálogo: SKU à mão, tipo produto, gere stock, criador da auditoria, sem modelo
    expect(corpo).toContain("is_active, is_sellable, is_purchasable, has_variants, is_deleted, manages_stock, created_by, tipo_catalogo, supplier_id, fornecedor_livre, sku_gerado)");
    expect(corpo).toContain("x.estado <> 'discontinued', x.vende, x.compra, false, false, true, c_criador, 'produto', f.id, sp.name, false");
    expect(corpo).not.toMatch(/INSERT INTO products \([^)]*\bmodel_id\b/);
    expect(corpo).toContain("now() + t.k * interval '1 microsecond'");
    expect(corpo).toContain("SELECT c_org, 'product', x.id, f.id, x.ssku, round(x.pc, 2), 'EUR', true, true, c_criador,");
  });

  it("o único DDL é a lista no schema privado _mudelar_excel (e as temporárias), fechada a PUBLIC, anon, authenticated e service_role", () => {
    const ddl = [...sql.matchAll(/(?:^|;|\bTHEN|\bLOOP)\s*((?:CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT)\b[^;(]*)/gi)].map((m) => m[1].trim());
    for (const d of ddl) expect(d).toMatch(/^(CREATE TEMP TABLE _o3_\w+$|CREATE SCHEMA IF NOT EXISTS _mudelar_excel$|CREATE TABLE _mudelar_excel\.onda3_\w+$|REVOKE ALL ON (SCHEMA|ALL TABLES IN SCHEMA) _mudelar_excel FROM PUBLIC, anon, authenticated, service_role$)/);
    expect(ddl.filter((d) => d.startsWith("REVOKE"))).toHaveLength(2);
    expect(sql).not.toMatch(/\bGRANT\b/);
    const temp = [...sql.matchAll(/CREATE TEMP TABLE (\w+) \([^;]*\) ON COMMIT DROP;/g)].map((m) => m[1]);
    expect(temp).toEqual(["_o3_ref", "_o3_prod"]);
    const copias = [...sql.matchAll(/CREATE TABLE _mudelar_excel\.(onda3_\w+)/g)].map((m) => m[1]);
    expect(copias).toEqual(["onda3_produtos", "onda3_precos", "onda3_item_suppliers", "onda3_product_organizations"]);
    expect(sql.indexOf("REVOKE ALL ON ALL TABLES IN SCHEMA")).toBeGreaterThan(sql.indexOf("CREATE TABLE _mudelar_excel.onda3_product_organizations"));
    expect(sql).toContain("SELECT coalesce(n.nspacl::text, '') INTO v_acl");
    expect(sql).toContain("SELECT coalesce(c.relacl::text, '') INTO v_acl");
    expect(sql).toContain("c.relkind::text = 'r'");
  });

  it("guardas antes da lista e da escrita, conferências depois", () => {
    const copia = sql.indexOf("CREATE SCHEMA IF NOT EXISTS _mudelar_excel");
    const escrita = sql.indexOf("INSERT INTO products (");
    expect(copia).toBeGreaterThan(0);
    expect(escrita).toBeGreaterThan(copia);
    const semOrg = sql.indexOf("não existe nesta base — nada a fazer.', c_org; RETURN;");
    const jaAplicada = sql.indexOf("RAISE NOTICE 'mudelar_excel_onda3: já aplicada");
    expect(semOrg).toBeGreaterThan(0);
    expect(jaAplicada).toBeGreaterThan(semOrg);
    expect(jaAplicada).toBeLessThan(copia);
    for (const g of ["L1: a lista tem % produtos", "L1: a lista tem % custos", "L1: as ligações", "L1: há produtos",
      "mudelar_excel_onda3: estado a meio", "G1: a Mudelar tem % produtos vivos", "G1: a Mudelar tem % famílias", "G2: % SKU da lista já existem",
      "G2: % SKU da lista têm o formato", "G2: % produtos da lista já existem com o mesmo nome", "G3: só % de % categorias", "G3: só % de % subcategorias",
      "G3: % produtos têm uma subcategoria", "G3: só % de % marcas", "G3: só % de % fornecedores", "G3: só % de % unidades", "G3: app.audit_bypass",
      "G5: o utilizador", "G6: %"]) {
      const i = sql.indexOf(`RAISE EXCEPTION '${g}`);
      expect(i, g).toBeGreaterThan(0);
      expect(i, g).toBeLessThan(copia);
    }
    for (const w of ["W1", "W2", "W3", "W4"]) expect(sql.indexOf(`RAISE EXCEPTION '${w}: %`), w).toBeGreaterThan(escrita);
    for (const c of ["C1: só % de % produtos criados têm os valores", "C1: só % de % produtos criados têm os preços", "C1: só % de % ligações",
      "C1: % produtos sem fornecedor", "C1: só % de % produtos criados estão ligados", "C1: % atributos", "C12: % linhas de auditoria dos produtos",
      "C12: % linhas de auditoria dos preços", "C12: % linhas de auditoria das ligações", "C12: % atualizações", "C2: há SKU", "C2: a Mudelar tem %",
      "C2: a Mudelar ficou com % modelos", "C3: mudaram", "C3: a Mudelar ficou", "C4: mudaram preços", "C4: mudaram ligações a fornecedores",
      "C4: mudaram ligações de produtos", "C5: a Mudelar ficou", "C5: unidades", "C6: mudaram", "C7: a Mudelar ficou", "C7: as famílias",
      "C7: % combinações", "C8: mudaram", "C9: %", "C10: o schema", "C10: % ficou"]) {
      expect(sql.indexOf(`RAISE EXCEPTION '${c}`), c).toBeGreaterThan(escrita);
    }
    expect(sql).toContain("PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));");
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(copia);
    expect(sql).not.toContain("app.audit_bypass', 'on'");
  });

  it("as impressões digitais não usam updated_at e comparam-se antes e depois (com a vista do cliente)", () => {
    expect(sql.match(/md5\(\(to_jsonb\(p\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(pp\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(i\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(v\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/FROM negocio_vista_cliente t WHERE t\.organization_id = c_org/g)).toHaveLength(2);
    for (const h of ["sku", "out", "preco", "isup", "po", "attr", "fam", "docs"]) expect(sql).toContain(`v_h_${h}_depois <> v_h_${h}_antes`);
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
    expect(readdirSync(pasta).filter((f) => /reverter-onda|reverter_onda|mudelar_excel.*reverter/i.test(f))).toEqual([]);
    expect(readdirSync(pasta).filter((f) => /mudelar_excel_onda3/.test(f))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270129700000_"))).toHaveLength(1);
  });
});
