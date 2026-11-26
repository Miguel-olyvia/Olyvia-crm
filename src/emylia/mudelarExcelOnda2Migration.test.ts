/**
 * @vitest-environment node
 */
// 26/11: a migration de DADOS «Mudelar igual aos Excels», onda 2 (20270129600000: os legados), lida como TEXTO. Confere o que
// se pode conferir sem a correr: as listas embutidas (ids únicos, contagens iguais às constantes, «para» diferente de «de»,
// preços positivos), a ligação legado→gémeo (semelhança >= 0,8, gémeo fora da lista dos legados, um valor por atributo e
// tantos como o gémeo tem), que só escreve nos campos desta onda e só INSERE atributos (nada de SKU, estado, subcategoria,
// modelo, apagar, gerar SKU, reapontar documentos), guardas antes da escrita e conferências depois, a cópia fechada, os
// RAISE com tantos % como argumentos e que a reversão não está na pasta das migrations. Erros de tipo do SQL só se apanham
// a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270129600000_mudelar_excel_onda2.sql";
const caminho = resolve(pasta, nome);
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

const ORG = "3242e925-da26-459a-8258-be04d904e355";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TEXTO = "'((?:[^']|'')*)'";
const NUM = "(-?\\d+(?:\\.\\d+)?)";
const des = (s: string | undefined): string | null => (s === undefined ? null : s.replace(/''/g, "'"));

/** O pedaço do ficheiro entre dois marcadores (as linhas de VALUES de cada tabela temporária). */
function secao(de: string, ate: string): string {
  const i = bruto.indexOf(de), j = bruto.indexOf(ate, i + de.length);
  return i < 0 || j < 0 ? "" : bruto.slice(i, j);
}
const constante = (n: string): number => Number((sql.match(new RegExp(`${n} constant integer := (\\d+);`)) ?? [])[1]);

const skus = [...secao("INSERT INTO _o2_sku", "CREATE TEMP TABLE _o2_prod").matchAll(new RegExp(`\\('(${UUID})', ${TEXTO}\\)`, "g"))]
  .map((m) => ({ id: m[1], sku: des(m[2]) as string }));
const prod = [...secao("INSERT INTO _o2_prod", "CREATE TEMP TABLE _o2_preco")
  .matchAll(new RegExp(`\\('(${UUID})', '(name|short_description|brand_id|fornecedor_livre)', (?:NULL|${TEXTO}), ${TEXTO}\\)`, "g"))]
  .map((m) => ({ id: m[1], campo: m[2], de: des(m[3]), para: des(m[4]) as string }));
const precos = [...secao("INSERT INTO _o2_preco", "CREATE TEMP TABLE _o2_isup")
  .matchAll(new RegExp(`\\('(${UUID})', '(${UUID})', '(purchase|retail|wholesale|distributor)', ${NUM}, ${NUM}, ${NUM}\\)`, "g"))]
  .map((m) => ({ row: m[1], produto: m[2], tipo: m[3], de: Number(m[4]), para: Number(m[5]), exato: Number(m[6]) }));
const OPT_U = `(?:NULL|'(${UUID})')`, OPT_T = `(?:NULL|${TEXTO})`, OPT_N = `(?:NULL|${NUM})`;
const isup = [...secao("INSERT INTO _o2_isup", "CREATE TEMP TABLE _o2_gemeo")
  .matchAll(new RegExp(`\\('(${UUID})', '(${UUID})', (true|false), ${OPT_U}, ${OPT_U}, (true|false), ${OPT_T}, ${OPT_T}, (true|false), ${OPT_N}, ${OPT_N}\\)`, "g"))]
  .map((m) => ({ id: m[1], produto: m[2], mSup: m[3] === "true", supDe: m[4], supPara: m[5], mSsku: m[6] === "true", sskuDe: des(m[7]),
    sskuPara: des(m[8]), mPp: m[9] === "true", ppDe: m[10] === undefined ? null : Number(m[10]), ppPara: m[11] === undefined ? null : Number(m[11]) }));
const gemeos = [...secao("INSERT INTO _o2_gemeo", "CREATE TEMP TABLE _o2_attr")
  .matchAll(new RegExp(`\\('(${UUID})', '(${UUID})', ${TEXTO}, ${NUM}, (\\d+)\\)`, "g"))]
  .map((m) => ({ legado: m[1], gemeo: m[2], gemeoSku: des(m[3]) as string, sim: Number(m[4]), nAttr: Number(m[5]) }));
const atributos = [...secao("INSERT INTO _o2_attr", "DO $mig$")
  .matchAll(new RegExp(`\\('(${UUID})', '(${UUID})', '(${UUID})', ${OPT_T}, (NULL|${NUM}), (NULL|true|false), (NULL|${TEXTO}::jsonb), (NULL|'\\d{4}-\\d{2}-\\d{2}'::date), ${OPT_T}\\)`, "g"))]
  .map((m) => ({ legado: m[1], atributo: m[2], valorGemeo: m[3], texto: des(m[4]), json: m[9] === undefined ? null : des(m[9]) }));

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
    expect(bruto).toContain("O QUE NÃO FAZ: não muda SKU");
    expect(bruto).toContain("não arquiva nem apaga nada");
    expect(bruto).toContain("não reaponta orçamentos");
    expect(bruto).toContain("EXCEÇÕES à letra do Excel");
    expect(bruto).toContain("depois de 20270129500000");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("REVERSÃO fora da pasta das migrations");
  });

  it("uma só transação: BEGIN, SET LOCAL dos tempos e COMMIT no fim", () => {
    expect(sql).toMatch(/^ ?BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '5min';/);
    expect(sql.trim().endsWith("END $mig$; COMMIT;")).toBe(true);
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
  });

  it("as listas têm os números das constantes e ids únicos", () => {
    const n = (c: string) => prod.filter((x) => x.campo === c).length;
    expect(skus).toHaveLength(constante("c_n_produtos"));
    expect(new Set(skus.map((s) => s.id)).size).toBe(skus.length);
    expect(n("name")).toBe(constante("c_n_nome"));
    expect(n("short_description")).toBe(constante("c_n_descr"));
    expect(n("brand_id")).toBe(constante("c_n_marca"));
    expect(n("fornecedor_livre")).toBe(constante("c_n_flivre"));
    expect(new Set(prod.map((x) => `${x.id}/${x.campo}`)).size).toBe(prod.length);
    expect(precos).toHaveLength(constante("c_n_preco"));
    expect(new Set(precos.map((x) => x.row)).size).toBe(precos.length);
    expect(isup).toHaveLength(constante("c_n_isup"));
    expect(new Set(isup.map((x) => x.id)).size).toBe(isup.length);
    expect(isup.filter((x) => x.mSup)).toHaveLength(constante("c_n_isup_sup"));
    expect(isup.filter((x) => x.mSsku)).toHaveLength(constante("c_n_isup_ssku"));
    expect(isup.filter((x) => x.mPp)).toHaveLength(constante("c_n_isup_pp"));
    expect(gemeos).toHaveLength(constante("c_n_gemeos"));
    expect(atributos).toHaveLength(constante("c_n_attr"));
    expect(constante("c_n_mudelar")).toBe(30010);
    expect(constante("c_n_fam")).toBe(548);
    expect(constante("c_n_membros")).toBe(14637);
  });

  it("os legados: SKU manual (nunca o formato gerado nem CONS/CAT/TESTE/DEMO), todos tocados por alguma alteração", () => {
    const ids = new Set(skus.map((s) => s.id));
    const tocados = new Set([...prod.map((x) => x.id), ...precos.map((x) => x.produto), ...isup.map((x) => x.produto), ...gemeos.map((g) => g.legado)]);
    for (const id of tocados) expect(ids.has(id)).toBe(true);
    expect(tocados.size).toBe(ids.size);
    for (const s of skus) {
      expect(s.sku).not.toMatch(/^[A-Z]{1,4}-[A-Z0-9]{1,4}-\d{3,4}/);
      expect(s.sku).not.toMatch(/^(CONS-|CAT-|TESTE)|DEMO/i);
    }
  });

  it("a ligação legado→gémeo: semelhança >= 0,8, gémeo com SKU gerado e fora da lista, um gémeo por legado", () => {
    const ids = new Set(skus.map((s) => s.id));
    expect(new Set(gemeos.map((g) => g.legado)).size).toBe(gemeos.length);
    for (const g of gemeos) {
      expect(g.sim).toBeGreaterThanOrEqual(0.8);
      expect(g.sim).toBeLessThanOrEqual(1);
      expect(ids.has(g.gemeo)).toBe(false);
      expect(g.gemeoSku).toMatch(/^[A-Z]{1,4}-[A-Z0-9]{1,4}-\d{3,4}/);
      expect(g.nAttr).toBeGreaterThan(0);
    }
    expect(gemeos.reduce((s, g) => s + g.nAttr, 0)).toBe(constante("c_n_attr"));
    expect(sql).toContain("CREATE TABLE _mudelar_excel.onda2_gemeos (legado_id uuid PRIMARY KEY,");
  });

  it("os atributos: só de legados com gémeo, tantos como o gémeo tem, um por atributo, valores não vazios e medidas em JSON", () => {
    const porLegado = new Map(gemeos.map((g) => [g.legado, g.nAttr]));
    const conta = new Map<string, number>();
    for (const a of atributos) {
      expect(porLegado.has(a.legado)).toBe(true);
      conta.set(a.legado, (conta.get(a.legado) ?? 0) + 1);
      expect(a.texto === null ? "" : a.texto.trim()).not.toBe("");
      if (a.json !== null) expect(() => JSON.parse(a.json as string)).not.toThrow();
    }
    for (const [l, n] of porLegado) expect(conta.get(l), l).toBe(n);
    expect(new Set(atributos.map((a) => `${a.legado}/${a.atributo}`)).size).toBe(atributos.length);
    expect(new Set(atributos.map((a) => a.valorGemeo)).size).toBe(atributos.length);
  });

  it("os valores: «para» diferente de «de», preços positivos e coerentes, ligações a fornecedores com alguma mudança", () => {
    for (const x of prod) {
      expect(x.para.trim()).toBe(x.para);
      expect(x.para.length).toBeGreaterThan(0);
      expect(x.para).not.toBe(x.de);
    }
    for (const x of precos) {
      expect(["purchase", "retail"]).toContain(x.tipo);
      expect(x.para).toBeGreaterThan(0);
      expect(Math.abs(x.para - x.de)).toBeGreaterThanOrEqual(0.005);
      expect(Math.abs(x.exato - x.para)).toBeLessThan(0.005);
    }
    for (const x of isup) {
      expect(x.mSup || x.mSsku || x.mPp).toBe(true);
      if (x.mSup) expect(x.supPara).not.toBe(x.supDe);
      if (x.mSsku) expect(x.sskuPara).not.toBe(x.sskuDe);
      if (x.mPp) expect(x.ppPara).not.toBe(x.ppDe);
    }
  });

  it("só escreve nos campos desta onda e só INSERE atributos: nada de SKU, estado, modelo, apagar, gerar SKU nem documentos", () => {
    const corpo = sql.slice(sql.indexOf("DO $mig$"));
    const updates = [...corpo.matchAll(/UPDATE (\w+) \w+ SET (.*?) (?:FROM|WHERE) /g)].map((m) => ({ t: m[1], set: m[2] }));
    expect(updates.map((u) => u.t)).toEqual(["products", "products", "products", "products", "item_suppliers", "item_suppliers",
      "item_suppliers", "product_prices"]);
    const colunas = updates.flatMap((u) => [...u.set.matchAll(/(?:^|, )(\w+) = /g)].map((m) => `${u.t}.${m[1]}`));
    expect(colunas).toEqual(["products.name", "products.short_description", "products.brand_id", "products.fornecedor_livre",
      "item_suppliers.supplier_sku", "item_suppliers.purchase_price",
      "item_suppliers.is_preferred",
      "item_suppliers.supplier_id", "item_suppliers.supplier_sku", "item_suppliers.purchase_price", "item_suppliers.is_preferred",
      "product_prices.price", "product_prices.preco_exato"]);
    const inserts = [...corpo.matchAll(/INSERT INTO ([\w.]+)/g)].map((m) => m[1]);
    expect(inserts.filter((t) => !t.startsWith("_mudelar_excel."))).toEqual(["entity_audit_log", "entity_audit_log", "product_attribute_values"]);
    expect(corpo).toContain("WHERE NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = a.legado_id)");
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/cat_gerar_sku_produto\s*\(|rpc_delete_product|rpc_bulk_delete_product/);
    expect(sql).not.toMatch(/SET [^;]*\b(sku|sku_gerado|status|subcategory_id|category_id|model_id|is_deleted|deleted_at|deleted_by|barcode)\s*=/);
    expect(sql).not.toMatch(/product_attribute_values\s+(?:\w+\s+)?SET|INSERT INTO products\b|INSERT INTO product_family|INSERT INTO product_prices/);
    expect(sql).not.toMatch(/UPDATE (quote_lines|negocio_produtos|purchase_order_items|negocio_vista_cliente|service_materials)\b/);
    expect(corpo.match(/UPDATE products p SET \w+ = x\.para(?:::uuid)? FROM _o2_prod x WHERE x\.campo = '\w+' AND p\.id = x\.id AND p\.organization_id = c_org/g)).toHaveLength(4);
    expect(corpo).toContain("i.organization_id = c_org AND i.deleted_at IS NULL AND i.is_preferred");
    expect(corpo).toContain("AND pp.product_id IN (SELECT p.id FROM products p WHERE p.organization_id = c_org);");
    expect(corpo).toContain("FROM _o2_attr a JOIN products p ON p.id = a.legado_id AND p.organization_id = c_org");
  });

  it("o único DDL é a cópia no schema privado _mudelar_excel (e as temporárias), fechada a PUBLIC, anon, authenticated e service_role", () => {
    const ddl = [...sql.matchAll(/(?:^|;|\bTHEN|\bLOOP)\s*((?:CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT)\b[^;(]*)/gi)].map((m) => m[1].trim());
    for (const d of ddl) expect(d).toMatch(/^(CREATE TEMP TABLE _o2_\w+$|CREATE SCHEMA IF NOT EXISTS _mudelar_excel$|CREATE TABLE _mudelar_excel\.onda2_\w+$|REVOKE ALL ON (SCHEMA|ALL TABLES IN SCHEMA) _mudelar_excel FROM PUBLIC, anon, authenticated, service_role$)/);
    expect(ddl.filter((d) => d.startsWith("REVOKE"))).toHaveLength(2);
    expect(sql).not.toMatch(/\bGRANT\b/);
    const temp = [...sql.matchAll(/CREATE TEMP TABLE (\w+) \([^;]*\) ON COMMIT DROP;/g)].map((m) => m[1]);
    expect(temp).toEqual(["_o2_sku", "_o2_prod", "_o2_preco", "_o2_isup", "_o2_gemeo", "_o2_attr"]);
    const copias = [...sql.matchAll(/CREATE TABLE _mudelar_excel\.(onda2_\w+)/g)].map((m) => m[1]);
    expect(copias).toEqual(["onda2_produtos", "onda2_plano_produtos", "onda2_precos", "onda2_item_suppliers", "onda2_gemeos", "onda2_atributos_novos"]);
    expect(sql.indexOf("REVOKE ALL ON ALL TABLES IN SCHEMA")).toBeGreaterThan(sql.indexOf("CREATE TABLE _mudelar_excel.onda2_atributos_novos"));
    expect(sql).toContain("SELECT coalesce(n.nspacl::text, '') INTO v_acl");
    expect(sql).toContain("SELECT coalesce(c.relacl::text, '') INTO v_acl");
    expect(sql).toContain("c.relkind::text = 'r'");
  });

  it("guardas antes da cópia e da escrita, conferências depois", () => {
    const copia = sql.indexOf("CREATE SCHEMA IF NOT EXISTS _mudelar_excel");
    const escrita = sql.indexOf("UPDATE products p SET name");
    expect(copia).toBeGreaterThan(0);
    expect(escrita).toBeGreaterThan(copia);
    const semOrg = sql.indexOf("não existe nesta base — nada a fazer.', c_org; RETURN;");
    const jaAplicada = sql.indexOf("RAISE NOTICE 'mudelar_excel_onda2: já aplicada");
    expect(semOrg).toBeGreaterThan(0);
    expect(jaAplicada).toBeGreaterThan(semOrg);
    expect(jaAplicada).toBeLessThan(copia);
    for (const g of ["L1: a lista", "L1: as listas de gémeos", "G1: a Mudelar tem % produtos vivos", "G1: a Mudelar tem % famílias",
      "G2: só % de % legados", "G2: % preços", "G7: só % de % gémeos", "G7: só % de % valores dos gémeos", "G7: só % de % valores a copiar",
      "mudelar_excel_onda2: estado a meio", "G4: só % de % marcas", "G4: só % de % fornecedores", "G4: um produto",
      "G4: % produtos têm outra ligação preferencial", "G4: % ligações a trocar", "G4: app.audit_bypass", "G5: o utilizador", "G6: %"]) {
      const i = sql.indexOf(`RAISE EXCEPTION '${g}`);
      expect(i, g).toBeGreaterThan(0);
      expect(i, g).toBeLessThan(copia);
    }
    for (const w of ["W1", "W2", "W3", "W4", "W5", "W5b", "W5c", "W6", "W8"]) expect(sql.indexOf(`RAISE EXCEPTION '${w}: %`), w).toBeGreaterThan(escrita);
    for (const c of ["C11: só % valores", "C11: products.supplier_id não", "C11: só % de % preços", "C11: só % de % ligações",
      "C11: products.supplier_id ficou", "C11: só % de % legados ficaram com os atributos", "C12: % linhas de auditoria das ligações",
      "C12: % auditorias de products", "C12: % linhas no histórico de preço das", "C12: % linhas no histórico de preços dos",
      "C12: % linhas de auditoria dos atributos", "C1: % legados", "C1: % preços", "C1: % ligações", "C2: há SKU", "C13: só %",
      "C3: mudaram", "C3: a Mudelar ficou", "C4: mudaram", "C5: mudaram", "C5: a Mudelar ficou", "C6: mudaram", "C6: a Mudelar tem",
      "C7: a Mudelar ficou", "C7: as famílias", "C7: % combinações", "C8: mudaram", "C9: %", "C10: o schema", "C10: % ficou"]) {
      expect(sql.indexOf(`RAISE EXCEPTION '${c}`), c).toBeGreaterThan(escrita);
    }
    expect(sql).toContain("PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));");
    expect(sql).toContain("ORDER BY p.id FOR NO KEY UPDATE;");
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(copia);
  });

  it("a troca de fornecedor: desmarca, troca e volta a marcar, com a auditoria dos gatilhos desligada só aí e escrita uma vez à mão", () => {
    const corpo = sql.slice(sql.indexOf("DO $mig$"));
    const on = corpo.indexOf("PERFORM set_config('app.audit_bypass', 'on', true);");
    const off = corpo.indexOf("PERFORM set_config('app.audit_bypass', 'off', true);");
    const w5a = corpo.indexOf("UPDATE item_suppliers i SET supplier_sku = ");
    const desmarca = corpo.indexOf("UPDATE item_suppliers i SET is_preferred = false FROM _o2_isup x WHERE x.m_sup AND");
    const troca = corpo.indexOf("UPDATE item_suppliers i SET supplier_id = x.sup_para,");
    const auditoria = corpo.indexOf("INSERT INTO entity_audit_log");
    const w8 = corpo.indexOf("INSERT INTO product_attribute_values");
    expect(corpo.match(/set_config\('app\.audit_bypass'/g)).toHaveLength(2);
    expect(w5a).toBeGreaterThan(0);
    expect(on).toBeGreaterThan(w5a);
    expect(desmarca).toBeGreaterThan(on);
    expect(troca).toBeGreaterThan(desmarca);
    expect(off).toBeGreaterThan(troca);
    expect(auditoria).toBeGreaterThan(off);
    // os atributos entram com a auditoria normal dos gatilhos (depois de app.audit_bypass voltar a off)
    expect(w8).toBeGreaterThan(off);
    expect(corpo.match(/SET supplier_id = /g)).toHaveLength(1);
    expect(corpo).toContain("WHERE k.key <> ALL (ARRAY['updated_at', 'search_text', 'contact_attempts', 'last_activity_at'])");
    expect(corpo.match(/NULL, c_criador, c_fonte FROM/g)).toHaveLength(2);
  });

  it("as impressões digitais não usam updated_at e comparam-se antes e depois (com a vista do cliente)", () => {
    expect(sql.match(/md5\(\(to_jsonb\(p\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(pp\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(i\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(v\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/FROM negocio_vista_cliente t WHERE t\.organization_id = c_org/g)).toHaveLength(2);
    for (const h of ["sku", "out", "preco", "isup", "attr", "fam", "docs"]) expect(sql).toContain(`v_h_${h}_depois <> v_h_${h}_antes`);
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

  it("a Anlorbel vai para o registo principal (18ebe983), nunca para o duplicado 5fdbcc9c", () => {
    const isupTxt = secao("INSERT INTO _o2_isup", ";");
    expect(isupTxt).not.toContain("5fdbcc9c-27e8-4635-b84f-2d4e0b21bf65");
    expect(prod.filter((p) => p.campo === "fornecedor_livre" && /anlorbel - com/i.test(p.para))).toEqual([]);
  });

  it("o MACBAL0009 fica de fora: o único candidato a gémeo (MACB-AL-0003-30) é de outra marca", () => {
    const fora = "c81d9849-6196-4d0c-9c68-744050fd3e8b";
    expect(skus.map((s) => s.sku)).not.toContain("MACBAL0009");
    expect(sql).not.toContain(fora);
    expect(gemeos.map((g) => g.gemeoSku)).not.toContain("MACB-AL-0003-30");
    expect(constante("c_n_produtos")).toBe(51);
    expect(constante("c_n_gemeos")).toBe(51);
    expect(constante("c_n_attr")).toBe(66);
  });

  it("nenhuma reversão na pasta das migrations e nenhum carimbo repetido", () => {
    expect(readdirSync(pasta).filter((f) => /reverter-onda|reverter_onda|mudelar_excel.*reverter/i.test(f))).toEqual([]);
    expect(readdirSync(pasta).filter((f) => /mudelar_excel_onda2/.test(f))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270129600000_"))).toHaveLength(1);
  });
});
