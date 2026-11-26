/**
 * @vitest-environment node
 */
// 26/11: a migration de DADOS das famílias da Mudelar, fase 1 (20270129050000), lida como TEXTO. Confere o que se pode conferir sem a correr:
// a lista embutida (ids únicos, um produto numa só família, 2 a 60 produtos, no máximo uma cor, posições 1…n, nomes únicos pela chave do índice e pelo
// identificador do ecrã), que só escreve por INSERT nas três tabelas das famílias, as guardas e conferências, o lock das funções do ecrã, os RAISE com
// tantos % como argumentos e que a reversão não está na pasta das migrations. Erros de tipo do SQL só se apanham a correr na base.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PREFIXO_FAMILIA, slug } from "./nucleo";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270129050000_familias_mudelar_fase1.sql";
const caminho = resolve(pasta, nome);
const bruto = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

const N_FAM = 548, N_MEMBROS = 14637, N_EIXOS = 1409, N_ATR = 7;
const ORG = "3242e925-da26-459a-8258-be04d904e355";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TEXTO = "'((?:[^']|'')*)'";

/** O pedaço do ficheiro entre dois marcadores (as linhas de VALUES de cada tabela temporária). */
function secao(de: string, ate: string): string {
  const i = bruto.indexOf(de), j = bruto.indexOf(ate, i + de.length);
  return i < 0 || j < 0 ? "" : bruto.slice(i, j);
}
const des = (s: string): string => s.replace(/''/g, "'");
const atr = [...secao("INSERT INTO _ff_atr", "CREATE TEMP TABLE _ff_fam").matchAll(new RegExp(`\\(${TEXTO}, '(${UUID})'\\)`, "g"))].map((m) => ({ code: des(m[1]), id: m[2] }));
const fams = [...secao("INSERT INTO _ff_fam", "CREATE TEMP TABLE _ff_eixo").matchAll(new RegExp(`\\((\\d+), '(${UUID})', ${TEXTO}\\)`, "g"))]
  .map((m) => ({ n: Number(m[1]), id: m[2], nome: des(m[3]) }));
const eixos = [...secao("INSERT INTO _ff_eixo", "CREATE TEMP TABLE _ff_membro").matchAll(new RegExp(`\\((\\d+), ${TEXTO}, '(cor|medida)', (\\d+)\\)`, "g"))]
  .map((m) => ({ n: Number(m[1]), code: des(m[2]), papel: m[3], posicao: Number(m[4]) }));
const membros = [...secao("INSERT INTO _ff_membro", "DO $mig$").matchAll(new RegExp(`\\((\\d+), '(${UUID})', ${TEXTO}\\)`, "g"))]
  .map((m) => ({ n: Number(m[1]), produto: m[2], sku: des(m[3]) }));

/** fn_cat_limpar_nome e fn_cat_chave_opcao (20270117500000), em TypeScript, para conferir a lista sem a base. */
const limpar = (s: string): string => s.replace(/[​-‏‪-‮⁠­﻿]/g, "").replace(/ /g, " ").replace(/\s+/g, " ").replace(/^ +| +$/g, "");
const DE = "áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ", PARA = "aaaaaaeeeeiiiiooooouuuucnyAAAAAAEEEEIIIIOOOOOUUUUCNY";
const chave = (s: string): string => [...limpar(s)].map((c) => { const i = DE.indexOf(c); return i < 0 ? c : PARA[i]; }).join("").toLowerCase();
const porFamilia = <T extends { n: number }>(xs: readonly T[]): Map<number, T[]> => {
  const m = new Map<number, T[]>();
  for (const x of xs) m.set(x.n, [...(m.get(x.n) ?? []), x]);
  return m;
};

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF, como os outros ficheiros do projeto", () => {
    expect(bruto.length).toBeGreaterThan(0);
    expect(bruto.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(bruto)).toBe(false);
  });

  it("o cabeçalho diz a base, o que toca, que nenhum produto muda, a ordem, o código que entra junto e a reversão", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain("SÓ TOCA EM TRÊS TABELAS, e só com INSERT: product_families, product_family_members e product_family_axes");
    expect(bruto).toContain("NENHUM PRODUTO É MEXIDO");
    expect(bruto).toContain("MIGRATION E CÓDIGO ENTRAM JUNTOS");
    expect(bruto).toContain("ANTES de 20270129100000");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("REVERSÃO: fora da pasta das migrations");
  });

  it("uma só transação: BEGIN, SET LOCAL dos tempos e COMMIT no fim", () => {
    expect(sql).toMatch(/^ ?BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '5min';/);
    expect(sql.trim().endsWith("END $mig$; COMMIT;")).toBe(true);
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
  });

  it("a lista: os números do cabeçalho, ids únicos, todas as linhas lidas", () => {
    expect(fams).toHaveLength(N_FAM);
    expect(membros).toHaveLength(N_MEMBROS);
    expect(eixos).toHaveLength(N_EIXOS);
    expect(atr).toHaveLength(N_ATR);
    expect(sql).toContain(`c_n_fam constant integer := ${N_FAM};`);
    expect(sql).toContain(`c_n_membros constant integer := ${N_MEMBROS};`);
    expect(sql).toContain(`c_n_eixos constant integer := ${N_EIXOS};`);
    expect(sql).toContain(`c_n_atr constant integer := ${N_ATR};`);
    expect(new Set(fams.map((f) => f.id)).size).toBe(N_FAM);
    expect(fams.map((f) => f.n)).toEqual(Array.from({ length: N_FAM }, (_, i) => i + 1));
    expect(new Set(atr.map((a) => a.id)).size).toBe(N_ATR);
  });

  it("um produto numa só família, e cada família com 2 a 60 produtos", () => {
    expect(new Set(membros.map((m) => m.produto)).size).toBe(N_MEMBROS);
    const pm = porFamilia(membros);
    expect(pm.size).toBe(N_FAM);
    for (const xs of pm.values()) expect(xs.length >= 2 && xs.length <= 60).toBe(true);
    expect(membros.every((m) => m.sku.trim() !== "")).toBe(true);
  });

  it("eixos: no máximo uma cor, 1 a 10 por família, posições 1…n, atributos da lista", () => {
    const codigos = new Set(atr.map((a) => a.code));
    const pe = porFamilia(eixos);
    expect(pe.size).toBe(N_FAM);
    for (const xs of pe.values()) {
      expect(xs.filter((e) => e.papel === "cor").length).toBeLessThanOrEqual(1);
      expect(xs.length >= 1 && xs.length <= 10).toBe(true);
      expect(xs.map((e) => e.posicao).sort((a, b) => a - b)).toEqual(xs.map((_, i) => i + 1));
      expect(new Set(xs.map((e) => e.code)).size).toBe(xs.length);
      // a ordem que o ecrã grava (eixosParaGravar): a cor primeiro
      const cor = xs.find((e) => e.papel === "cor");
      if (cor) expect(cor.posicao).toBe(1);
    }
    expect(eixos.every((e) => codigos.has(e.code))).toBe(true);
  });

  it("nomes: limpos, até 200 caracteres, únicos pela chave do índice e pelo identificador do ecrã («fam:» + slug)", () => {
    for (const f of fams) {
      expect(f.nome).toBe(limpar(f.nome));
      expect(f.nome.length >= 1 && f.nome.length <= 200).toBe(true);
    }
    expect(new Set(fams.map((f) => chave(f.nome))).size).toBe(N_FAM);
    expect(new Set(fams.map((f) => `${PREFIXO_FAMILIA}${slug(f.nome)}`)).size).toBe(N_FAM);
  });

  it("só toca a Mudelar: sai por NOTICE antes de escrever se a organização ou os produtos não existem", () => {
    expect(sql).toContain(`c_org constant uuid := '${ORG}'`);
    const semOrg = sql.indexOf("não existe nesta base — nada a fazer.', c_org; RETURN;");
    const semProdutos = sql.indexOf("não existem aqui — nada a fazer.'; RETURN;");
    const primeiraEscrita = sql.indexOf("INSERT INTO product_families");
    expect(semOrg).toBeGreaterThan(0);
    expect(semProdutos).toBeGreaterThan(semOrg);
    expect(primeiraEscrita).toBeGreaterThan(semProdutos);
    expect(sql).toMatch(/RAISE NOTICE 'familias_mudelar_fase1: já aplicada/);
    expect(sql).toMatch(/RAISE EXCEPTION 'familias_mudelar_fase1: estado a meio/);
  });

  it("só escreve por INSERT nas três tabelas das famílias, com ON CONFLICT DO NOTHING e contagem a seguir", () => {
    const inserts = [...sql.matchAll(/INSERT INTO (public\.)?(\w+)/g)].map((m) => m[2]);
    expect(inserts.filter((t) => !t.startsWith("_ff_"))).toEqual(["product_families", "product_family_axes", "product_family_members"]);
    expect(sql.match(/ON CONFLICT DO NOTHING; GET DIAGNOSTICS v_n = ROW_COUNT;/g)).toHaveLength(3);
    expect(sql).not.toMatch(/\bUPDATE\s+(public\.)?\w+\s+(\w+\s+)?SET\b/i);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    // nenhum DDL nem privilégio (a instrução começa depois de um «;» ou do «THEN»/«LOOP»; «ON COMMIT DROP» das temporárias não conta)
    expect(sql).not.toMatch(/(^|;|\bTHEN|\bLOOP)\s*(ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT|CREATE (OR REPLACE|TABLE|UNIQUE|INDEX|POLICY|FUNCTION|TRIGGER))\b/i);
    expect(sql).not.toMatch(/cat_guardar_familia\(|cat_apagar_familia\(/);
    // as tabelas temporárias desaparecem no COMMIT
    const temp = [...sql.matchAll(/CREATE TEMP TABLE (\w+) \([^;]*\) ON COMMIT DROP;/g)].map((m) => m[1]);
    expect(temp).toEqual(["_ff_atr", "_ff_fam", "_ff_eixo", "_ff_membro"]);
  });

  it("o lock é o das funções do ecrã e os produtos ficam presos até ao fim", () => {
    expect(sql).toContain("PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));");
    expect(sql).toContain("ORDER BY p.id FOR SHARE;");
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(sql.indexOf("INSERT INTO product_families"));
  });

  it("guardas antes da escrita e conferências depois", () => {
    const escrita = sql.indexOf("INSERT INTO product_families");
    for (const g of ["L1: a lista", "L2: % famílias", "L3: % nomes", "E1: % dos ids", "G1: só % de % produtos", "G2: % dos produtos", "G3: só % de %", "G4: o criador", "G5: % famílias"]) {
      const i = sql.indexOf(`RAISE EXCEPTION '${g}`);
      expect(i, g).toBeGreaterThan(0);
      expect(i, g).toBeLessThan(escrita);
    }
    for (const c of ["C1: a Mudelar ficou com % famílias", "C1: a Mudelar ficou com % eixos", "C2: %", "C3: %", "C4: %", "C5: %", "C6: os produtos", "C7: as famílias", "C8: %", "C9: %"]) {
      const i = sql.indexOf(`RAISE EXCEPTION '${c}`);
      expect(i, c).toBeGreaterThan(escrita);
    }
    // G1: produto vivo (is_deleted e deleted_at), tipo produto e SKU conferido por id
    expect(sql).toContain("p.tipo_catalogo::text = 'produto' AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.sku IS NOT DISTINCT FROM m.sku");
    // G3: atributos vivos da Mudelar
    expect(sql).toContain("WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = x.code");
  });

  it("a impressão digital dos produtos, preços e valores não usa updated_at e compara-se antes e depois", () => {
    expect(sql.match(/md5\(\(to_jsonb\(p\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(pp\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql.match(/md5\(\(to_jsonb\(v\) - 'updated_at'\)::text\)/g)).toHaveLength(2);
    expect(sql).toContain("v_h_prod_depois <> v_h_prod_antes");
    expect(sql).toContain("v_h_outras_depois <> v_h_outras_antes");
  });

  it("C8 confere RLS, políticas e privilégios das três tabelas por ::text", () => {
    expect(sql).toContain("coalesce(c.relacl::text, '')");
    expect(sql).toContain("pl.polcmd::text <> 'r'");
    expect(sql).toContain("v_acl LIKE '%authenticated=%' OR v_acl LIKE '%anon=%'");
  });

  it("os RAISE com % têm tantos argumentos como %", () => {
    const raises = [...sql.matchAll(/RAISE (?:EXCEPTION|NOTICE|WARNING) '((?:[^']|'')*)'([^;]*);/g)];
    expect(raises.length).toBeGreaterThan(20);
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
    expect(readdirSync(pasta).filter((f) => /familias_mudelar|reverter_familias|familias-reverter/.test(f))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270129050000_"))).toHaveLength(1);
  });
});
