/**
 * @vitest-environment node
 */
// 25/11: a migration C1 «separar Cor de Acabamento» (20270126420000) lida como TEXTO. Confere o que se pode conferir sem a
// correr: o cabeçalho (código do 3D entra junto, importação do Excel, só base de RH), as 170 opções (144 / 14 / 12, sem as
// fora do âmbito, com os 23 metais), os ids fixos, que mexe só por UPDATE na própria linha (sem DELETE, sem cópias, sem
// escrever em products), as guardas com os números do plano e os RAISE com % escapado. Erros de tipo do SQL só se
// apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const caminho = resolve(pasta, "20270126420000_separar_cor_acabamento_mudelar.sql");
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");
const contar = (texto: string, agulha: string): number => texto.split(agulha).length - 1;

/** As linhas da lista das opções a mover: (id, origem, value_text). */
const lista = [...sql.matchAll(/\('([0-9a-f-]{36})', '(cor|cor_corpo|cor_frente)', '((?:[^']|'')*)'\)/g)].map((m) => ({ id: m[1], origem: m[2], valor: m[3] }));

// Fora do âmbito (decisões do dono): Todo Branco / Todo Branco Lacado, cores de dois tons, as DUVIDA; e as cores com código
const FORA = [
  "4fecdd4f-9c37-492b-ab05-2680613e586d", "9402d79a-afa8-420b-9e1b-e28f63b1fe8b", "0f2279b1-9c69-4953-812f-b1d089480ec8", "5cc96345-df07-43ae-b3f8-c3481d3e666b",
  "69626cbb-d125-4171-9d23-196358bb0a78", "b9e28ae5-0374-4139-b174-d09b1c0309a1", "78942e5b-33ad-449d-b601-5ef328c3dfcc", "2a57bef1-580e-40c2-a6cb-287d7b66c5c4",
  "edb4091b-747c-411c-b788-61ec2b30e21b", "10a75277-404d-430c-9b1f-2207f6b52ffb",
  "132c6102-1586-4eb9-abac-787f93ef9341", "ab0ebea5-1861-4dff-b42a-bfa400d97654", "e2a85a73-69f3-4eaa-b7fc-f5e4550bf0ba", "7bd0d0fd-61c1-4b78-95a5-8c2c68186f56",
  "6793e78a-d24d-4d2f-a3a2-1c223e37d341", "f443da74-a152-4501-9a59-4d7879f4aa6b", "6de546b1-22d9-4e1c-8aae-95f50321ead3", "2ee9d4f7-4a53-41f6-a28d-06ebe14d5cae",
  "579ddfa7-f39d-4de2-94f9-051cf6210b4c", "5490705e-c910-4ec3-9b51-c024af092c5c",
  "061c3b44-129e-46d2-bc18-85e03401136c", "7ebf4e14-d129-487a-ab58-24675f20916a", "f735bbbc-51b5-4428-92fa-9ee8f13cdb2b",
];
// Os 23 metais (17 da Cor, 3 do corpo, 3 da frente): vão todos para o acabamento
const METAIS = [
  "2daa0c7f-b115-42c3-996b-c0ec3df172af", "29e54cd9-b847-440b-a3c2-161f1f554a0c", "9883ef45-572c-4667-88a5-41f0a677bc22", "5737c950-c2d5-40e0-aaac-22892877aee4",
  "682a598c-8d24-4670-a153-672dbddf0563", "7557779a-d6c5-4ede-9be4-badaadef3c80", "c67bb86a-5190-45a2-9792-437b68abf60c", "42303e1b-88c9-4058-91a2-6ed834b15487",
  "dab1fa15-4660-4ebd-b7ea-f00c702b6db6", "07397ff8-7edd-4431-898d-fc28266bc027", "6d3b3bcc-c9dd-4c58-bcaa-89772537bb1a", "cb297d5a-7a4e-4710-953c-d7984f3a51d8",
  "3d3561b6-dec8-4990-800c-73981b4e2cf3", "755b76fa-ffde-43ab-8586-38561423ef48", "7a2d4b61-14eb-4d66-be53-8b6ed6e17b98", "d0668aa1-22fa-4516-b4b8-ce3b2521560e",
  "740084cc-68f7-4d96-8774-de63dbaeffcb",
  "65533ffb-de7e-46d1-8407-5e59f87c31c0", "399b0d2c-0097-4e94-831e-3c35888e39da", "b22520ff-6d94-40bc-8725-5ee0e3267ce5",
  "4113c84e-f784-43be-9b44-20e7dd3828f5", "3e13871d-a6a6-464b-a2df-49a31cf3c4c7", "310ed225-fa87-41bf-ba37-75ba2a967a20",
];
const IDS_FIXOS = [
  "c9e95561-0976-4b8b-9c3b-3c2dda8eafd0", "bbe6e07c-3ec9-4d7c-8166-d225b0fcd2db", "e6b72f24-ad45-498a-838b-a2b004b90569",
  "d5667f24-0b2b-420c-a37f-faea74dd6684", "965103d5-f16d-4e0a-bddc-08f065b7fc13", "a0dca4ad-ff59-4a9b-a03e-ceb28cd52fcb",
];

describe("migration 20270126420000_separar_cor_acabamento_mudelar.sql", () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz que o código do 3D entra junto, que a importação do Excel repõe a Cor e que é só da base de RH", () => {
    expect(bruto).toMatch(/MIGRATION E CÓDIGO ENTRAM JUNTOS/);
    for (const s of ["previaProduto3d.ts", "fotoDosAtributos", "corDosAtributos", "zonasGlb.ts", "Artisan", "Oak", "Denver"]) expect(bruto).toContain(s);
    expect(bruto).toMatch(/importação nova do Excel[^\n]*coluna «Cor»[^\n]*atributo «Cor»/);
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
  });

  it("só toca a Mudelar da base de RH: sai por NOTICE antes de escrever se a organização ou os atributos não existem", () => {
    expect(sql).toContain("c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355'");
    const primeiraEscrita = sql.indexOf("INSERT INTO product_attributes");
    const semOrg = sql.indexOf("não existe nesta base — nada a fazer.', c_org; RETURN;");
    const semAtributos = sql.indexOf("não existem aqui — nada a fazer.'; RETURN;");
    expect(semOrg).toBeGreaterThan(0);
    expect(semAtributos).toBeGreaterThan(semOrg);
    expect(primeiraEscrita).toBeGreaterThan(semAtributos);
    // a meio falha; já aplicada sai por NOTICE
    expect(sql).toMatch(/RAISE EXCEPTION 'separar_cor_acabamento: estado a meio/);
    expect(sql).toMatch(/RAISE NOTICE 'separar_cor_acabamento: já aplicada/);
  });

  it("move 170 opções (144 da Cor, 14 do corpo, 12 da frente), sem repetidos e sem as fora do âmbito", () => {
    expect(lista).toHaveLength(170);
    expect(new Set(lista.map((x) => x.id)).size).toBe(170);
    expect(lista.filter((x) => x.origem === "cor")).toHaveLength(144);
    expect(lista.filter((x) => x.origem === "cor_corpo")).toHaveLength(14);
    expect(lista.filter((x) => x.origem === "cor_frente")).toHaveLength(12);
    for (const id of FORA) expect(lista.map((x) => x.id)).not.toContain(id);
    for (const nome of ["Todo Branco", "Todo Branco Lacado", "GRIS 7035", "Plomo", "Dourado/Branco"]) expect(lista.map((x) => x.valor)).not.toContain(nome);
  });

  it("todos os 23 metais vão para o acabamento; Artisan, Oak e Denver (sem hex) também", () => {
    const ids = lista.map((x) => x.id);
    for (const id of METAIS) expect(ids).toContain(id);
    for (const nome of ["Artisan", "Oak", "Denver", "CROMO"]) expect(lista.some((x) => x.valor === nome)).toBe(true);
  });

  it("3 atributos e 3 grupos com ids fixos e distintos; atributos com sku_entra, hex e foto, nas posições 2 / 4 / 6", () => {
    expect(new Set(IDS_FIXOS).size).toBe(6);
    for (const id of IDS_FIXOS) expect(contar(sql, `'${id}'`)).toBe(1);
    expect(sql).toMatch(/'acabamento_cor', 'Acabamento da cor', 2, 3,/);
    expect(sql).toMatch(/'acabamento_corpo', 'Acabamento do corpo', 4, 12,/);
    expect(sql).toMatch(/'acabamento_frente', 'Acabamento da frente', 6, 13,/);
    expect(sql).toMatch(/'select'::attribute_type, 'list', true, p\.sku_ordem_novo, p\.sort_novo, true, true, false/);
    // os outros sobem 3 a partir da Tonalidade (Cor 1, Cor do corpo 3, Cor da frente 5)
    expect(sql).toMatch(/'tonalidade', 4, 7\)/);
    expect(sql).toMatch(/'aplicacao', 17, 20\)/);
    expect(sql).toMatch(/'cor_corpo', 2, 3\)/);
    expect(sql).toMatch(/'cor_frente', 3, 5\)/);
  });

  it("muda na própria linha: UPDATE de group_id e de attribute_id, sem DELETE, sem cópias de opções, sem escrever em products", () => {
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/\bINSERT INTO attribute_option_group_values\b/i);
    expect(sql).not.toMatch(/\bINSERT INTO product_attribute_values\b/i);
    expect(sql).not.toMatch(/\bUPDATE products\b/i);
    expect(sql).not.toMatch(/\b(ALTER|CREATE OR REPLACE FUNCTION|DROP FUNCTION|DROP TRIGGER)\b/i);
    expect(sql.match(/DROP TABLE IF EXISTS [^;]*;/g)?.every((d) => !/public\./.test(d) && /pg_temp\._sep_/.test(d))).toBe(true);
    expect(sql).toContain("UPDATE attribute_option_group_values o SET group_id = p.g_novo FROM");
    expect(sql).toContain("UPDATE product_attribute_values v SET attribute_id = b.a_destino FROM");
    expect(sql).not.toMatch(/SET sigla|sigla = |SET hex_color|SET foto_path/);
  });

  it("guardas com os números do plano, antes e depois", () => {
    for (const n of ["c_opcoes constant integer := 170", "c_valores constant integer := 6887", "c_produtos constant integer := 30010",
      "c_gerados constant integer := 29639", "c_prod_mex constant integer := 4712", "c_sem_cor constant integer := 3410", "c_pav_total constant integer := 95711"]) {
      expect(sql).toContain(n);
    }
    // antes: 237 / 33 / 31 opções e 1 234 / 2 175 / 3 478 valores a mover; depois 93/19/19/144/14/12 e 15724/8805/7503/1234/2175/3478
    expect(sql).toMatch(/237, 144, 16958, 1234\)/);
    expect(sql).toMatch(/33, 14, 10980, 2175\)/);
    expect(sql).toMatch(/31, 12, 10981, 3478\)/);
    expect(sql).toContain("(c_g_cor, 93), (c_g_corpo, 19), (c_g_frente, 19), (c_ng_cor, 144), (c_ng_corpo, 14), (c_ng_frente, 12)");
    expect(sql).toContain("(c_a_cor, 15724), (c_a_corpo, 8805), (c_a_frente, 7503), (c_n_cor, 1234), (c_n_corpo, 2175), (c_n_frente, 3478)");
    // o SKU: recalculado com fn_cat_sku_partes e comparado com o guardado; nenhum duplicado
    expect(sql).toContain("public.fn_cat_sku_partes(c_org, p.category_id, p.subcategory_id, coalesce(pv.vals, '[]'::jsonb))");
    expect(sql).toMatch(/mudariam de referência \(esperados 0\)/);
    expect(sql).toMatch(/count\(\*\) - count\(DISTINCT p\.sku\)/);
    // colisão de sigla ou de valor no destino: falha
    expect(sql).toMatch(/RAISE EXCEPTION 'G3: % valores e % siglas repetidos no destino/);
  });

  it("auditoria identificada, locks da ordem do SKU e das siglas, timeouts", () => {
    expect(sql).toContain("c_fonte constant text := 'migration:separar_cor_acabamento'");
    expect(sql).toContain("PERFORM set_config('app.audit_source', c_fonte, true);");
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('cat_sku_config:' \|\| c_org::text, 0\)\)/);
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('cat_sigla_opc:' \|\| g\.g::text, 0\)\)/);
    expect(sql).toMatch(/SET lock_timeout = '5s';/);
  });

  it("os RAISE com % literal estão escapados (nenhum % sem parâmetro)", () => {
    const raises = [...sql.matchAll(/RAISE (?:EXCEPTION|NOTICE|WARNING) '((?:[^']|'')*)'([^;]*);/g)];
    expect(raises.length).toBeGreaterThan(20);
    for (const m of raises) {
      const marcas = (m[1].replace(/%%/g, "").match(/%/g) ?? []).length;
      // parâmetros separados por vírgulas de topo (left(v_txt, 1500) conta como um)
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

  it("nenhuma migration de reversão desta na pasta das migrations", () => {
    const ficheiros = readdirSync(pasta).filter((f) => /separar_cor_acabamento/.test(f));
    expect(ficheiros).toEqual(["20270126420000_separar_cor_acabamento_mudelar.sql"]);
  });
});
