/**
 * @vitest-environment node
 */
// 25/11: a migration C2 «ligar o aspeto e marcar os metais» (20270126440000) lida como TEXTO. Confere o que se pode
// conferir sem a correr: o cabeçalho (só base de RH, não depende de código novo), as 23 opções metal com a superfície
// certa (CROMO polida; ROSA GOLD ESCOVADO e Gun Metal mate; o resto acetinada), os 3 atributos que ligam e o original que
// não liga, que só escreve por UPDATE com ids fixos, as guardas e os RAISE com % escapado. Erros de tipo do SQL só se
// apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270126440000_aspeto_metais_mudelar.sql";
const caminho = resolve(pasta, nome);
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

/** As linhas da lista dos metais: (id, grupo, value_text, superficie). */
const lista = [...sql.matchAll(/\('([0-9a-f-]{36})', (c_ng_cor|c_ng_corpo|c_ng_frente), '((?:[^']|'')*)', '(polida|acetinada|mate)'\)/g)]
  .map((m) => ({ id: m[1], grupo: m[2], valor: m[3], superficie: m[4] }));

// Os 23 metais da classe METAL do plano (17 da Cor, 3 do corpo, 3 da frente), os mesmos que a C1 move
const METAIS = [
  "2daa0c7f-b115-42c3-996b-c0ec3df172af", "29e54cd9-b847-440b-a3c2-161f1f554a0c", "9883ef45-572c-4667-88a5-41f0a677bc22", "5737c950-c2d5-40e0-aaac-22892877aee4",
  "682a598c-8d24-4670-a153-672dbddf0563", "7557779a-d6c5-4ede-9be4-badaadef3c80", "c67bb86a-5190-45a2-9792-437b68abf60c", "42303e1b-88c9-4058-91a2-6ed834b15487",
  "dab1fa15-4660-4ebd-b7ea-f00c702b6db6", "07397ff8-7edd-4431-898d-fc28266bc027", "6d3b3bcc-c9dd-4c58-bcaa-89772537bb1a", "cb297d5a-7a4e-4710-953c-d7984f3a51d8",
  "3d3561b6-dec8-4990-800c-73981b4e2cf3", "755b76fa-ffde-43ab-8586-38561423ef48", "7a2d4b61-14eb-4d66-be53-8b6ed6e17b98", "d0668aa1-22fa-4516-b4b8-ce3b2521560e",
  "740084cc-68f7-4d96-8774-de63dbaeffcb",
  "65533ffb-de7e-46d1-8407-5e59f87c31c0", "399b0d2c-0097-4e94-831e-3c35888e39da", "b22520ff-6d94-40bc-8725-5ee0e3267ce5",
  "4113c84e-f784-43be-9b44-20e7dd3828f5", "3e13871d-a6a6-464b-a2df-49a31cf3c4c7", "310ed225-fa87-41bf-ba37-75ba2a967a20",
];

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz que é só da base de RH e que não depende de código novo", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain("NÃO DEPENDE DE CÓDIGO NOVO");
    expect(bruto).toContain("supabase migration list --linked");
  });

  it("só toca a Mudelar: sai por NOTICE antes de escrever se a organização ou os atributos da C1 não existem", () => {
    expect(sql).toContain("c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355'");
    const semOrg = sql.indexOf("não existe nesta base — nada a fazer.', c_org; RETURN;");
    const semAtributos = sql.indexOf("não existem aqui — nada a fazer.'; RETURN;");
    const primeiraEscrita = sql.indexOf("UPDATE product_attributes");
    expect(semOrg).toBeGreaterThan(0);
    expect(semAtributos).toBeGreaterThan(semOrg);
    expect(primeiraEscrita).toBeGreaterThan(semAtributos);
    expect(sql).toMatch(/RAISE NOTICE 'aspeto_metais_mudelar: já aplicada/);
    expect(sql).toMatch(/RAISE EXCEPTION 'aspeto_metais_mudelar: estado a meio/);
  });

  it("liga o aspeto nos 3 atributos de acabamento da C1 e não no «Acabamento» original", () => {
    for (const id of ["c9e95561-0976-4b8b-9c3b-3c2dda8eafd0", "bbe6e07c-3ec9-4d7c-8166-d225b0fcd2db", "e6b72f24-ad45-498a-838b-a2b004b90569"]) {
      expect(sql).toContain(`'${id}'`);
    }
    expect(sql).toContain("c_acabamento constant uuid := 'd3a0a0e9-53a2-406c-b2d9-6c8be05c2aa1'");
    expect(sql).toContain("UPDATE product_attributes a SET has_aspect = true WHERE a.id IN (c_n_cor, c_n_corpo, c_n_frente)");
    expect(sql).not.toMatch(/has_aspect = true WHERE[^;]*c_acabamento/);
    expect(sql).toMatch(/«Acabamento» original com aspeto: %/);
  });

  it("marca os 23 metais, sem repetidos, com CROMO polida, ROSA GOLD ESCOVADO e Gun Metal mate e o resto acetinada", () => {
    expect(lista).toHaveLength(23);
    expect(new Set(lista.map((x) => x.id)).size).toBe(23);
    expect([...lista.map((x) => x.id)].sort()).toEqual([...METAIS].sort());
    expect(lista.filter((x) => x.grupo === "c_ng_cor")).toHaveLength(17);
    expect(lista.filter((x) => x.grupo === "c_ng_corpo")).toHaveLength(3);
    expect(lista.filter((x) => x.grupo === "c_ng_frente")).toHaveLength(3);
    const sup = (v: string) => lista.filter((x) => x.valor === v).map((x) => x.superficie);
    expect(sup("CROMO")).toEqual(["polida"]);
    expect(sup("ROSA GOLD ESCOVADO")).toEqual(["mate"]);
    expect(sup("Gun Metal")).toEqual(["mate"]);
    expect(lista.filter((x) => x.superficie === "acetinada")).toHaveLength(20);
    expect(lista.filter((x) => x.superficie === "polida")).toHaveLength(1);
    expect(lista.filter((x) => x.superficie === "mate")).toHaveLength(2);
  });

  it("só escreve por UPDATE com ids fixos: sem DDL, sem INSERT nas tabelas, sem DELETE, sem tocar em products", () => {
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/\bINSERT INTO (public\.)?(product_attributes|attribute_option_group_values|product_attribute_values)\b/i);
    expect(sql).not.toMatch(/\bUPDATE (public\.)?(products|product_attribute_values)\b/i);
    expect(sql).not.toMatch(/\b(ALTER|CREATE OR REPLACE FUNCTION|DROP FUNCTION|DROP TRIGGER|GRANT|REVOKE)\b/i);
    expect(sql.match(/DROP TABLE IF EXISTS [^;]*;/g)?.every((d) => !/public\./.test(d) && /pg_temp\._c2_/.test(d))).toBe(true);
    expect(sql).toContain("UPDATE attribute_option_group_values o SET is_metal = true, superficie = m.superficie FROM _c2_metal m");
    expect(sql).not.toMatch(/SET sigla|sigla = |SET hex_color|SET foto_path|SET group_id/);
    // nenhuma escrita através das RPCs (exigem utilizador)
    expect(sql).not.toMatch(/cat_aspeto_opcao\(|cat_definir_aspeto_atributo\(/);
  });

  it("guardas e conferências: contagens antes e depois, nada fora do âmbito, auditoria identificada", () => {
    expect(sql).toContain("c_metais constant integer := 23");
    expect(sql).toMatch(/RAISE EXCEPTION 'G1: só % das % opções metal/);
    expect(sql).toMatch(/RAISE EXCEPTION 'G2: % opções não metal/);
    expect(sql).toMatch(/RAISE EXCEPTION 'C2: % de % metais marcados; % acetinada \(esperadas 20\)/);
    expect(sql).toMatch(/RAISE EXCEPTION 'C4: fora do âmbito/);
    expect(sql).toContain("PERFORM set_config('app.audit_source', c_fonte, true);");
    expect(sql).toContain("c_fonte constant text := 'migration:aspeto_metais_mudelar'");
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
    expect(readdirSync(pasta).filter((f) => /aspeto_metais/.test(f))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270126440000_"))).toHaveLength(1);
  });
});
