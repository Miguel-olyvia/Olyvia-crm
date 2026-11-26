/**
 * @vitest-environment node
 */
// 26/11: a migration de DADOS «Mudelar igual aos Excels», onda 1 (20270129500000), lida como TEXTO. Confere o que se pode
// conferir sem a correr: as listas embutidas (ids únicos, contagens iguais às constantes, valores «para» diferentes dos «de»,
// preços positivos, IVA válido), que só escreve nos campos desta onda (nada de SKU, estado, subcategoria, modelo, apagar),
// que as guardas vêm antes da escrita e as conferências depois, a cópia fechada, os RAISE com tantos % como argumentos e
// que a reversão não está na pasta das migrations. Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270129500000_mudelar_excel_onda1.sql";
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

const skus = [...secao("INSERT INTO _o1_sku", "CREATE TEMP TABLE _o1_prod").matchAll(new RegExp(`\\('(${UUID})', ${TEXTO}\\)`, "g"))]
  .map((m) => ({ id: m[1], sku: des(m[2]) as string }));
const prod = [...secao("INSERT INTO _o1_prod", "CREATE TEMP TABLE _o1_preco")
  .matchAll(new RegExp(`\\('(${UUID})', '(name|short_description|brand_id|fornecedor_livre)', (?:NULL|${TEXTO}), ${TEXTO}\\)`, "g"))]
  .map((m) => ({ id: m[1], campo: m[2], de: des(m[3]), para: des(m[4]) as string }));
const precos = [...secao("INSERT INTO _o1_preco", "CREATE TEMP TABLE _o1_novo")
  .matchAll(new RegExp(`\\('(${UUID})', '(${UUID})', '(purchase|retail|wholesale|distributor)', ${NUM}, ${NUM}, ${NUM}\\)`, "g"))]
  .map((m) => ({ row: m[1], produto: m[2], tipo: m[3], de: Number(m[4]), para: Number(m[5]), exato: Number(m[6]) }));
const novos = [...secao("INSERT INTO _o1_novo", "CREATE TEMP TABLE _o1_isup")
  .matchAll(new RegExp(`\\('(${UUID})', '(\\w+)', (\\d+), ${NUM}, ${NUM}, ${NUM}\\)`, "g"))]
  .map((m) => ({ produto: m[1], tipo: m[2], ordem: Number(m[3]), price: Number(m[4]), exato: Number(m[5]), vat: Number(m[6]) }));
const OPT_U = `(?:NULL|'(${UUID})')`, OPT_T = `(?:NULL|${TEXTO})`, OPT_N = `(?:NULL|${NUM})`;
const isup = [...secao("INSERT INTO _o1_isup", "DO $mig$")
  .matchAll(new RegExp(`\\('(${UUID})', '(${UUID})', (true|false), ${OPT_U}, ${OPT_U}, (true|false), ${OPT_T}, ${OPT_T}, (true|false), ${OPT_N}, ${OPT_N}\\)`, "g"))]
  .map((m) => ({ id: m[1], produto: m[2], mSup: m[3] === "true", supDe: m[4], supPara: m[5], mSsku: m[6] === "true", sskuDe: des(m[7]),
    sskuPara: des(m[8]), mPp: m[9] === "true", ppDe: m[10] === undefined ? null : Number(m[10]), ppPara: m[11] === undefined ? null : Number(m[11]) }));

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz a base, a organização, o pedido, o que não faz, a ordem e a reversão", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain(`SÓ A MUDELAR (${ORG})`);
    expect(bruto).toContain("«men so faz que teja tudo como nos excels sf»");
    expect(bruto).toContain("O QUE NÃO FAZ: não muda SKU");
    expect(bruto).toContain("EXCEÇÕES à letra do Excel");
    expect(bruto).toContain("depois de 20270129300000");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("REVERSÃO: fora da pasta das migrations");
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
    expect(novos).toHaveLength(constante("c_n_novo"));
    expect(new Set(novos.map((x) => `${x.produto}/${x.tipo}`)).size).toBe(novos.length);
    expect(isup).toHaveLength(constante("c_n_isup"));
    expect(new Set(isup.map((x) => x.id)).size).toBe(isup.length);
    expect(isup.filter((x) => x.mSup)).toHaveLength(constante("c_n_isup_sup"));
    expect(isup.filter((x) => x.mSsku)).toHaveLength(constante("c_n_isup_ssku"));
    expect(isup.filter((x) => x.mPp)).toHaveLength(constante("c_n_isup_pp"));
    expect(constante("c_n_mudelar")).toBe(30010);
    expect(constante("c_n_fam")).toBe(548);
    expect(constante("c_n_membros")).toBe(14637);
  });

  it("todos os produtos tocados estão na lista de SKU, e cada produto tocado tem alguma alteração", () => {
    const ids = new Set(skus.map((s) => s.id));
    const tocados = new Set([...prod.map((x) => x.id), ...precos.map((x) => x.produto), ...novos.map((x) => x.produto), ...isup.map((x) => x.produto)]);
    for (const id of tocados) expect(ids.has(id)).toBe(true);
    expect(tocados.size).toBe(ids.size);
    expect(skus.every((s) => s.sku.trim() !== "")).toBe(true);
  });

  it("os valores: «para» diferente de «de», nomes limpos e sem «(sem preço)» nem «Resguardo Resguardo», marcas por id", () => {
    for (const x of prod) {
      expect(x.para.trim()).toBe(x.para);
      expect(x.para.length).toBeGreaterThan(0);
      expect(x.para).not.toBe(x.de);
    }
    for (const x of prod.filter((p) => p.campo === "name")) {
      expect(x.para).not.toMatch(/\(sem preço\)/);
      expect(x.para).not.toMatch(/resguardo\s+resguardo/i);
      expect(x.para).not.toMatch(/\s{2}/);
    }
    for (const x of prod.filter((p) => p.campo === "short_description")) expect(x.de).toBeNull();
    for (const x of prod.filter((p) => p.campo === "brand_id")) expect(x.para).toMatch(new RegExp(`^${UUID}$`));
  });

  it("os preços: positivos, diferentes, preco_exato coerente; os novos só grossista e distribuidor com IVA válido", () => {
    for (const x of precos) {
      expect(x.para).toBeGreaterThan(0);
      expect(Math.abs(x.para - x.de)).toBeGreaterThanOrEqual(0.005);
      expect(Math.abs(x.exato - x.para)).toBeLessThan(0.005);
    }
    for (const x of novos) {
      expect(["wholesale", "distributor"]).toContain(x.tipo);
      expect(x.price).toBeGreaterThan(0);
      expect([0, 6, 13, 23]).toContain(x.vat);
    }
    for (const x of isup) {
      expect(x.mSup || x.mSsku || x.mPp).toBe(true);
      if (x.mSup) expect(x.supPara).not.toBe(x.supDe);
      if (x.mSsku) expect(x.sskuPara).not.toBe(x.sskuDe);
      if (x.mPp) expect(x.ppPara).not.toBe(x.ppDe);
    }
  });

  it("só escreve nos campos desta onda: nada de SKU, estado, subcategoria, modelo, atributos, apagar nem gerar SKU", () => {
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
    expect(inserts.filter((t) => !t.startsWith("_mudelar_excel."))).toEqual(["entity_audit_log", "entity_audit_log", "product_prices"]);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/cat_gerar_sku_produto|rpc_delete_product|rpc_bulk_delete_product/);
    expect(sql).not.toMatch(/SET [^;]*\b(sku|status|subcategory_id|category_id|model_id|is_deleted|deleted_at|barcode)\s*=/);
    expect(sql).not.toMatch(/product_attribute_values\s+(?:\w+\s+)?SET|INSERT INTO product_attribute_values|INSERT INTO products\b/);
    // cada UPDATE leva o filtro da Mudelar
    expect(corpo.match(/UPDATE products p SET \w+ = x\.para(?:::uuid)? FROM _o1_prod x WHERE x\.campo = '\w+' AND p\.id = x\.id AND p\.organization_id = c_org/g)).toHaveLength(4);
    expect(corpo).toContain("i.organization_id = c_org AND i.deleted_at IS NULL AND i.is_preferred");
    expect(corpo).toContain("AND pp.product_id IN (SELECT p.id FROM products p WHERE p.organization_id = c_org);");
  });

  it("o único DDL é a cópia no schema privado _mudelar_excel (e as temporárias), fechada a PUBLIC, anon, authenticated e service_role", () => {
    const ddl = [...sql.matchAll(/(?:^|;|\bTHEN|\bLOOP)\s*((?:CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT)\b[^;(]*)/gi)].map((m) => m[1].trim());
    for (const d of ddl) expect(d).toMatch(/^(CREATE TEMP TABLE _o1_\w+$|CREATE SCHEMA IF NOT EXISTS _mudelar_excel$|CREATE TABLE _mudelar_excel\.onda1_\w+$|REVOKE ALL ON (SCHEMA|ALL TABLES IN SCHEMA) _mudelar_excel FROM PUBLIC, anon, authenticated, service_role$)/);
    expect(ddl.filter((d) => d.startsWith("REVOKE"))).toHaveLength(2);
    expect(sql).not.toMatch(/\bGRANT\b/);
    const temp = [...sql.matchAll(/CREATE TEMP TABLE (\w+) \([^;]*\) ON COMMIT DROP;/g)].map((m) => m[1]);
    expect(temp).toEqual(["_o1_sku", "_o1_prod", "_o1_preco", "_o1_novo", "_o1_isup"]);
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
    const jaAplicada = sql.indexOf("RAISE NOTICE 'mudelar_excel_onda1: já aplicada");
    expect(semOrg).toBeGreaterThan(0);
    expect(jaAplicada).toBeGreaterThan(semOrg);
    expect(jaAplicada).toBeLessThan(copia);
    for (const g of ["L1: a lista", "G1: a Mudelar tem % produtos vivos", "G1: a Mudelar tem % famílias", "G2: só % de %", "G2: % preços",
      "mudelar_excel_onda1: estado a meio", "G4: só % de % marcas", "G4: só % de % fornecedores", "G4: um produto",
      "G4: % produtos têm outra ligação preferencial", "G4: % ligações a trocar", "G4: app.audit_bypass", "G5: o utilizador", "G6: %"]) {
      const i = sql.indexOf(`RAISE EXCEPTION '${g}`);
      expect(i, g).toBeGreaterThan(0);
      expect(i, g).toBeLessThan(copia);
    }
    for (const w of ["W1", "W2", "W3", "W4", "W5", "W5b", "W5c", "W6", "W7"]) expect(sql.indexOf(`RAISE EXCEPTION '${w}: %`), w).toBeGreaterThan(escrita);
    for (const c of ["C11: só %", "C11: marca_livre", "C11: products.supplier_id não", "C11: products.supplier_id ficou", "C12: % linhas de auditoria",
      "C12: só % de % auditorias", "C12: % auditorias de products", "C12: % linhas no histórico de preço das", "C12: % linhas no histórico de preços dos",
      "C1: % produtos tocados", "C1: % preços", "C1: % ligações",
      "C2: há SKU", "C3: mudaram", "C3: a Mudelar ficou", "C4: mudaram", "C5: mudaram", "C5: a Mudelar ficou", "C6: mudaram", "C7: a Mudelar ficou",
      "C7: as famílias", "C7: % combinações", "C8: mudaram", "C9: %", "C10: o schema", "C10: % ficou"]) {
      expect(sql.indexOf(`RAISE EXCEPTION '${c}`), c).toBeGreaterThan(escrita);
    }
    expect(sql).toContain("PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));");
    expect(sql).toContain("ORDER BY p.id FOR NO KEY UPDATE;");
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(copia);
  });

  it("a troca de fornecedor: desmarca, troca e volta a marcar, com a auditoria dos gatilhos desligada só aí e escrita uma vez à mão", () => {
    // 26/11: o db push falhou com 23505 — fn_item_suppliers_check_preferred_conflict (BEFORE) conta a própria linha, ainda com o
    // fornecedor antigo, como «outro preferencial» quando supplier_id muda num só UPDATE de uma ligação preferencial.
    const corpo = sql.slice(sql.indexOf("DO $mig$"));
    const on = corpo.indexOf("PERFORM set_config('app.audit_bypass', 'on', true);");
    const off = corpo.indexOf("PERFORM set_config('app.audit_bypass', 'off', true);");
    const w5a = corpo.indexOf("UPDATE item_suppliers i SET supplier_sku = ");
    const desmarca = corpo.indexOf("UPDATE item_suppliers i SET is_preferred = false FROM _o1_isup x WHERE x.m_sup AND");
    const troca = corpo.indexOf("UPDATE item_suppliers i SET supplier_id = x.sup_para,");
    const auditoria = corpo.indexOf("INSERT INTO entity_audit_log");
    const w6 = corpo.indexOf("UPDATE product_prices pp SET price");
    expect(corpo.match(/set_config\('app\.audit_bypass'/g)).toHaveLength(2);
    expect(w5a).toBeGreaterThan(0);
    expect(on).toBeGreaterThan(w5a);
    expect(desmarca).toBeGreaterThan(on);
    expect(troca).toBeGreaterThan(desmarca);
    expect(off).toBeGreaterThan(troca);
    expect(auditoria).toBeGreaterThan(off);
    expect(w6).toBeGreaterThan(auditoria);
    // o W5a não toca no fornecedor e só nas ligações sem troca; a troca volta a marcar e só apanha as que o passo 1 desmarcou
    expect(corpo.slice(w5a, desmarca)).toContain("WHERE NOT x.m_sup AND i.id = x.id");
    expect(corpo.slice(w5a, on)).not.toMatch(/supplier_id =/);
    expect(corpo.slice(troca, off)).toContain("is_preferred = true FROM _o1_isup x WHERE x.m_sup AND");
    expect(corpo.slice(troca, off)).toContain("i.deleted_at IS NULL AND NOT i.is_preferred AND i.supplier_id = x.sup_de");
    // só um UPDATE muda supplier_id: o do passo 2, depois de desmarcar
    expect(corpo.match(/SET supplier_id = /g)).toHaveLength(1);
    expect(corpo.match(/SET supplier_id = x\.sup_para,/g)).toHaveLength(1);
    // a auditoria escrita à mão: ligações (sem os ruídos) e products.supplier_id, com o utilizador e a fonte da migration
    expect(corpo).toContain("WHERE k.key <> ALL (ARRAY['updated_at', 'search_text', 'contact_attempts', 'last_activity_at'])");
    expect(corpo.match(/NULL, c_criador, c_fonte FROM/g)).toHaveLength(2);
    expect(corpo).toContain("jsonb_build_object('supplier_id', jsonb_build_object('old', b.linha -> 'supplier_id', 'new', to_jsonb(p.supplier_id)))");
  });

  it("as impressões digitais não usam updated_at e comparam-se antes e depois", () => {
    expect(sql.match(/md5\(\(to_jsonb\(p\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(pp\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(i\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(v\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/FROM negocio_vista_cliente t WHERE t\.organization_id = c_org/g)).toHaveLength(2);
    for (const h of ["sku", "out", "preco", "isup", "attr", "fam", "docs"]) expect(sql).toContain(`v_h_${h}_depois <> v_h_${h}_antes`);
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

  it("a Anlorbel vai para o registo principal (18ebe983), nunca para o duplicado 5fdbcc9c", () => {
    const isupTxt = secao("INSERT INTO _o1_isup", ";");
    expect(isupTxt).not.toContain("5fdbcc9c-27e8-4635-b84f-2d4e0b21bf65");
    expect((isupTxt.match(/'18ebe983-523a-4c8e-9721-ba0d0d1a9662'/g) ?? []).length).toBeGreaterThan(0);
    expect(prod.filter((p) => p.campo === "fornecedor_livre" && /anlorbel - com/i.test(p.para))).toEqual([]);
  });

  it("nenhuma reversão na pasta das migrations e nenhum carimbo repetido", () => {
    expect(readdirSync(pasta).filter((f) => /mudelar_excel|reverter-onda|reverter_onda/.test(f))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270129500000_"))).toHaveLength(1);
  });
});
