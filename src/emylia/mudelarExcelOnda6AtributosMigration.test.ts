/**
 * @vitest-environment node
 */
// 27/11: a migration de DADOS «Mudelar igual aos Excels», onda 6 (20270129900000: atributos dos produtos que não têm
// nenhum), lida como TEXTO. Confere o que se pode conferir sem a correr: as listas embutidas (ids únicos, contagens iguais
// às constantes, cada produto com tantos valores como diz, uma opção OU uma medida por valor, medidas positivas em cm),
// que só INSERE em product_attribute_values (nada de UPDATE, DELETE, SKU, modelo, gerar SKU, opções nem atributos novos),
// guardas antes da escrita e conferências depois, a cópia fechada, os RAISE com tantos % como argumentos e que a reversão
// não está na pasta das migrations. Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270129900000_mudelar_excel_onda6_atributos.sql";
const caminho = resolve(pasta, nome);
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

const ORG = "3242e925-da26-459a-8258-be04d904e355";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TEXTO = "'((?:[^']|'')*)'";
const NUM = "(\\d+(?:\\.\\d+)?)";
const des = (s: string | undefined): string | null => (s === undefined ? null : s.replace(/''/g, "'"));

function secao(de: string, ate: string): string {
  const i = bruto.indexOf(de), j = bruto.indexOf(ate, i + de.length);
  return i < 0 || j < 0 ? "" : bruto.slice(i, j);
}
const constante = (n: string): number => Number((sql.match(new RegExp(`${n} constant integer := (\\d+);`)) ?? [])[1]);

const produtos = [...secao("INSERT INTO _o6_prod", "CREATE TEMP TABLE _o6_attr").matchAll(new RegExp(`\\('(${UUID})', ${TEXTO}, (\\d+)\\)`, "g"))]
  .map((m) => ({ id: m[1], sku: des(m[2]) as string, n: Number(m[3]) }));
const valores = [...secao("INSERT INTO _o6_attr", "DO $mig$")
  .matchAll(new RegExp(`\\('(${UUID})', '(${UUID})', '(\\w+)', (?:NULL|${TEXTO}), (?:NULL|'(2D|3D)'), (NULL|${NUM}), (NULL|${NUM}), (NULL|${NUM}), (?:NULL|'(cm)')\\)`, "g"))]
  .map((m) => ({ produto: m[1], atributo: m[2], codigo: m[3], opcao: des(m[4]), tipo: m[5] ?? null,
    l: m[7] === undefined ? null : Number(m[7]), c: m[9] === undefined ? null : Number(m[9]), e: m[11] === undefined ? null : Number(m[11]), u: m[12] ?? null }));

const COR = new Set(["cor", "cor_corpo", "cor_frente", "acabamento", "acabamento_cor", "acabamento_corpo", "acabamento_frente", "tonalidade"]);

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz a base, a organização, o pedido, o que não faz, os pais, a ordem e a reversão", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain(`SÓ A MUDELAR (${ORG})`);
    expect(bruto).toContain("«se são importados, a cor");
    expect(bruto).toContain("O QUE NÃO FAZ: não muda SKU");
    expect(bruto).toContain("não cria opções nem atributos");
    expect(bruto).toContain("recebem SÓ a medida ou a");
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

  it("as listas têm os números das constantes, ids únicos e cada produto tantos valores como diz", () => {
    expect(produtos).toHaveLength(constante("c_n_produtos"));
    expect(new Set(produtos.map((p) => p.id)).size).toBe(produtos.length);
    expect(valores).toHaveLength(constante("c_n_attr"));
    expect(valores.filter((v) => v.tipo !== null)).toHaveLength(constante("c_n_medida"));
    expect(valores.filter((v) => v.opcao !== null)).toHaveLength(constante("c_n_opcao"));
    expect(constante("c_n_medida") + constante("c_n_opcao")).toBe(constante("c_n_attr"));
    expect(new Set(valores.map((v) => `${v.produto}/${v.atributo}`)).size).toBe(valores.length);
    const conta = new Map<string, number>();
    for (const v of valores) conta.set(v.produto, (conta.get(v.produto) ?? 0) + 1);
    for (const p of produtos) {
      expect(p.n).toBeGreaterThan(0);
      expect(conta.get(p.id), p.sku).toBe(p.n);
    }
    expect(conta.size).toBe(produtos.length);
    expect(constante("c_n_fam")).toBe(548);
    expect(constante("c_n_membros")).toBe(14637);
  });

  it("nenhum consumível nem SKU de teste; cada código de atributo aponta sempre para o mesmo id", () => {
    for (const p of produtos) expect(p.sku).not.toMatch(/^(CONS-|CAT-|TESTE)|DEMO/i);
    const ids = new Map<string, string>();
    for (const v of valores) {
      if (ids.has(v.codigo)) expect(ids.get(v.codigo)).toBe(v.atributo);
      ids.set(v.codigo, v.atributo);
    }
    expect(new Set(ids.values()).size).toBe(ids.size);
  });

  it("cada valor é uma opção (texto não vazio, sem medida) OU uma medida 2D/3D em cm com números positivos", () => {
    for (const v of valores) {
      if (v.codigo === "medida") {
        expect(v.opcao).toBeNull();
        expect(["2D", "3D"]).toContain(v.tipo);
        expect(v.u).toBe("cm");
        expect(v.l).toBeGreaterThan(0);
        expect(v.c).toBeGreaterThan(0);
        if (v.tipo === "3D") expect(v.e).toBeGreaterThan(0);
        else expect(v.e).toBeNull();
      } else {
        expect(v.tipo).toBeNull();
        expect(v.l).toBeNull();
        expect(v.u).toBeNull();
        expect((v.opcao ?? "").trim()).toBe(v.opcao);
        expect((v.opcao ?? "").length).toBeGreaterThan(0);
      }
    }
  });

  it("os produtos só com medida ou largura são a maioria dos pais; cor e acabamentos só nos que têm uma cor no nome", () => {
    const porProduto = new Map<string, string[]>();
    for (const v of valores) porProduto.set(v.produto, [...(porProduto.get(v.produto) ?? []), v.codigo]);
    const comCor = [...porProduto.values()].filter((cs) => cs.some((c) => COR.has(c)));
    expect(comCor.length).toBeGreaterThan(0);
    expect(comCor.length).toBeLessThan(produtos.length);
    // nunca duas cores do mesmo lado: cor_corpo e acabamento_corpo (ou frente) juntos seria ambíguo
    for (const cs of porProduto.values()) {
      expect(cs.includes("cor_corpo") && cs.includes("acabamento_corpo")).toBe(false);
      expect(cs.includes("cor_frente") && cs.includes("acabamento_frente")).toBe(false);
      expect(cs.includes("medida") && cs.includes("largura")).toBe(false);
    }
  });

  it("só INSERE em product_attribute_values: nada de UPDATE fora da cópia, DELETE, SKU, modelo, gerar SKU, opções nem atributos", () => {
    const corpo = sql.slice(sql.indexOf("DO $mig$"));
    const updates = [...corpo.matchAll(/UPDATE ([\w.]+) /g)].map((m) => m[1]);
    expect(updates).toEqual(["_mudelar_excel.onda6_atributos_novos"]);
    const inserts = [...corpo.matchAll(/INSERT INTO ([\w.]+)/g)].map((m) => m[1]);
    expect(inserts.filter((t) => !t.startsWith("_mudelar_excel."))).toEqual(["product_attribute_values"]);
    expect(corpo).toContain("ON CONFLICT (product_id, attribute_id) DO NOTHING");
    expect(corpo).toContain("WHERE NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = z.product_id)");
    expect(corpo).toContain("JOIN products p ON p.id = z.product_id AND p.organization_id = c_org AND NOT p.is_deleted");
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/cat_gerar_sku_produto\s*\(|cat_guardar_produto_atributos\s*\(|rpc_delete_product/);
    expect(sql).not.toMatch(/INSERT INTO (products|attribute_option_group_values|attribute_option_groups|product_attributes|product_family|product_prices)\b/);
    expect(sql).not.toMatch(/app\.audit_bypass', 'on'/);
  });

  it("grava como o ecrã: opção em value_text; medida com fn_cat_dimensao_medida, fn_cat_dimensao_texto e unit", () => {
    expect(sql).toContain("public.fn_cat_dimensao_medida(to_jsonb(a.med_l), 'A largura')");
    expect(sql).toContain("public.fn_cat_dimensao_medida(to_jsonb(a.med_c), 'O comprimento')");
    expect(sql).toContain("CASE WHEN a.med_tipo = '3D' THEN public.fn_cat_dimensao_medida(to_jsonb(a.med_e), 'A espessura') END");
    expect(sql).toContain("jsonb_build_object('tipo', x.med_tipo, 'largura', x.l, 'comprimento', x.c, 'espessura', x.e, 'unidade', x.med_u)");
    expect(sql).toContain("o.group_id = public.fn_cat_grupo_do_atributo(pa.id, c_org) AND o.is_active AND o.value_text = a.opcao");
  });

  it("o único DDL é a cópia no schema privado _mudelar_excel (e as temporárias), fechada", () => {
    const ddl = [...sql.matchAll(/(?:^|;|\bTHEN|\bLOOP)\s*((?:CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT)\b[^;(]*)/gi)].map((m) => m[1].trim());
    for (const d of ddl) expect(d).toMatch(/^(CREATE TEMP TABLE _o6_\w+$|CREATE SCHEMA IF NOT EXISTS _mudelar_excel$|CREATE TABLE _mudelar_excel\.onda6_\w+$|REVOKE ALL ON (SCHEMA|ALL TABLES IN SCHEMA) _mudelar_excel FROM PUBLIC, anon, authenticated, service_role$)/);
    expect(ddl.filter((d) => d.startsWith("REVOKE"))).toHaveLength(2);
    expect(sql).not.toMatch(/\bGRANT\b/);
    const temp = [...sql.matchAll(/CREATE TEMP TABLE (\w+) \([^;]*\) ON COMMIT DROP;/g)].map((m) => m[1]);
    expect(temp).toEqual(["_o6_prod", "_o6_attr"]);
    const copias = [...sql.matchAll(/CREATE TABLE _mudelar_excel\.(onda6_\w+)/g)].map((m) => m[1]);
    expect(copias).toEqual(["onda6_produtos", "onda6_atributos_novos"]);
    expect(sql.indexOf("REVOKE ALL ON ALL TABLES IN SCHEMA")).toBeGreaterThan(sql.indexOf("CREATE TABLE _mudelar_excel.onda6_atributos_novos"));
    expect(sql).toContain("SELECT coalesce(n.nspacl::text, '') INTO v_acl");
    expect(sql).toContain("SELECT coalesce(c.relacl::text, '') INTO v_acl");
    expect(sql).toContain("c.relkind::text = 'r'");
  });

  it("guardas antes da cópia e da escrita, conferências depois", () => {
    const copia = sql.indexOf("CREATE SCHEMA IF NOT EXISTS _mudelar_excel");
    const escrita = sql.indexOf("INSERT INTO product_attribute_values");
    expect(copia).toBeGreaterThan(0);
    expect(escrita).toBeGreaterThan(copia);
    const semOrg = sql.indexOf("não existe nesta base — nada a fazer.', c_org; RETURN;");
    const jaAplicada = sql.indexOf("RAISE NOTICE 'mudelar_excel_onda6: já aplicada");
    expect(semOrg).toBeGreaterThan(0);
    expect(jaAplicada).toBeGreaterThan(semOrg);
    expect(jaAplicada).toBeLessThan(copia);
    for (const g of ["L1: a lista de produtos", "L1: a lista de atributos", "L1: as listas", "G1: a Mudelar tem % famílias", "G2: só % de % produtos",
      "G3: só % de % valores", "mudelar_excel_onda6: estado a meio", "G5: o utilizador", "G5: app.audit_bypass", "G6: %"]) {
      const i = sql.indexOf(`RAISE EXCEPTION '${g}`);
      expect(i, g).toBeGreaterThan(0);
      expect(i, g).toBeLessThan(copia);
    }
    for (const w of ["B2: %", "W1: % atributos escritos", "W1: % atributos copiados"]) expect(sql.indexOf(`RAISE EXCEPTION '${w}`), w).toBeGreaterThan(copia);
    for (const c of ["C1: só % de % opções", "C1: só % de % medidas", "C1: só % de % produtos", "C2: %", "C3: há SKU", "C3: mudaram linhas",
      "C3: só % de % produtos", "C3: a Mudelar ficou", "C4: mudaram", "C5: mudaram", "C5: a Mudelar tem", "C6: a Mudelar ficou",
      "C6: as famílias", "C6: % combinações", "C7: %", "C8: o schema", "C8: % ficou"]) {
      expect(sql.indexOf(`RAISE EXCEPTION '${c}`), c).toBeGreaterThan(escrita);
    }
    expect(sql).toContain("PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));");
    expect(sql).toContain("ORDER BY p.id FOR NO KEY UPDATE;");
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(copia);
  });

  it("as impressões digitais de products incluem updated_at e comparam-se antes e depois", () => {
    expect(sql.match(/md5\(to_jsonb\(p\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(to_jsonb\(pp\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(to_jsonb\(v\)::text\)/g)).toHaveLength(2);
    for (const h of ["sku", "prod", "preco", "attr", "fam"]) expect(sql).toContain(`v_h_${h}_depois <> v_h_${h}_antes`);
  });

  it("os RAISE com % têm tantos argumentos como %", () => {
    const raises = [...sql.matchAll(/RAISE (?:EXCEPTION|NOTICE|WARNING) '((?:[^']|'')*)'([^;]*);/g)];
    expect(raises.length).toBeGreaterThan(25);
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
    expect(readdirSync(pasta).filter((f) => /mudelar_excel_onda6/.test(f))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270129900000_"))).toHaveLength(1);
  });
});
