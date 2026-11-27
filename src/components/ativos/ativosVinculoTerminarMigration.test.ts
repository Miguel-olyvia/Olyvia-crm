/**
 * @vitest-environment node
 */
// 27/11: a migration F1.3 (20270130400000, bloqueio do «Terminar» com itens por devolver) lida como TEXTO, antes de
// qualquer push. Esta migration fica RETIDA até o ecrã traduzir o HRV14. Confere: CRLF, cabeçalho (retida, o que o
// ecrã tem de fazer, a dependência da 20270130200000), uma só transação, a mesma assinatura e retorno de
// rpc_hr_vinculo_terminar, o resto da função igual, o bloqueio SÓ no ramo que termina já e depois do HRV10, o trinco
// da pessoa antes da contagem, o HRV14, nenhum aviso no ramo agendado (o sino foi retirado), direitos e guardas.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270130400000_hr_vinculo_terminar_por_devolver.sql";
const caminho = resolve(pasta, nome);
const bytes = existsSync(caminho) ? readFileSync(caminho) : Buffer.alloc(0);
const bruto = bytes.toString("utf8");
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

/** O corpo de uma função: de CREATE [OR REPLACE] FUNCTION public.<nome>( até ao $$; que a fecha. */
function corpo(fn: string): string {
  const m = new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${fn}\\(`).exec(sql);
  if (!m) return "";
  const fim = sql.indexOf("$$;", sql.indexOf("AS $$", m.index));
  return sql.slice(m.index, fim + 3);
}

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF em todas as linhas (contado por bytes 0x0D)", () => {
    expect(bytes.length).toBeGreaterThan(0);
    let lf = 0;
    let crlf = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x0a) {
        lf++;
        if (i > 0 && bytes[i - 1] === 0x0d) crlf++;
      }
    }
    expect(lf).toBeGreaterThan(150);
    expect(crlf).toBe(lf);
  });

  it("carimbo único e o último da fase 1 (depois da regra única de que depende)", () => {
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270130400000_"))).toEqual([nome]);
    expect(nome.slice(0, 14) > "20270130300000").toBe(true);
    expect(existsSync(resolve(pasta, "20270130200000_ativos_por_devolver.sql"))).toBe(true);
  });

  it("cabeçalho: RETIDA até ao ecrã do HRV14, o que o ecrã tem de fazer e a ordem", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain("RETIDA: NÃO APLICAR NEM ENVIAR ATÉ O ECRÃ QUE TRADUZ O HRV14 ESTAR PUBLICADO");
    for (const f of ["src/lib/hr/errosFimContrato.ts", "AccaoFimContratoDialog", "src/hooks/usePessoaContratoFim.ts:162", "usePessoa.ts:601"]) {
      expect(bruto, f).toContain(f);
    }
    expect(bruto).toContain("20270130200000_ativos_por_devolver TEM de estar aplicada");
    expect(bruto).toContain("supabase migration list --linked");
  });

  it("uma só transação, com lock_timeout logo no início; só a função", () => {
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
    expect(sql).toMatch(/BEGIN; SET LOCAL lock_timeout = '5s';/);
    expect(sql).not.toMatch(/\b(CREATE|ALTER|DROP) (TABLE|INDEX|TRIGGER|POLICY)\b/i);
    expect(sql).not.toMatch(/ADD (COLUMN|CONSTRAINT)|DROP FUNCTION/i);
    expect(sql.match(/CREATE (OR REPLACE )?FUNCTION/g)).toHaveLength(1);
  });

  it("mesma assinatura e retorno; lê também pessoa_id; o resto igual ao lido a 27/11", () => {
    const c = corpo("rpc_hr_vinculo_terminar");
    expect(c).toContain(
      "CREATE OR REPLACE FUNCTION public.rpc_hr_vinculo_terminar(p_vinculo_id uuid, p_motivo text DEFAULT NULL::text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''",
    );
    expect(c).toContain("SELECT pv.id, pv.pessoa_id, pv.organization_id, pv.estado, pv.data_fim INTO v FROM public.pessoas_vinculos pv WHERE pv.id = p_vinculo_id AND pv.deleted_at IS NULL FOR UPDATE;");
    for (const igual of [
      "NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.edit', v.organization_id) THEN RAISE EXCEPTION 'Sem permissao para terminar este contrato.' USING ERRCODE = 'HRV05';",
      "USING ERRCODE = 'HRV06';",
      "SELECT * INTO e FROM public.hr_contrato_regra_efectiva(p_vinculo_id);",
      "USING ERRCODE = 'HRV10';",
      "PERFORM set_config('hr.vinculo_via_rpc', 'on', true);",
      "SET fim_decisao = 'terminar', fim_decisao_em = now(), fim_decisao_por = v_user",
      "v_resultado := 'agendado';",
      "PERFORM public.hr_contratos_resolver_avisos(v.id, 'decidido', NULL);",
      "RETURN v_resultado;",
    ]) {
      expect(c, igual).toContain(igual);
    }
  });

  it("o bloqueio: só no ramo que termina já, depois do HRV10, trinco da pessoa ANTES da contagem e do UPDATE", () => {
    const c = corpo("rpc_hr_vinculo_terminar");
    const hrv10 = c.indexOf("USING ERRCODE = 'HRV10'");
    const ramo = c.indexOf("IF v.data_fim < current_date THEN");
    const trinco = c.indexOf("PERFORM pg_advisory_xact_lock(hashtextextended('hr_equipamentos:' || v.pessoa_id::text, 0));");
    const conta = c.indexOf("SELECT count(*) INTO v_n FROM public.ativos_itens_por_devolver(v.organization_id, v.pessoa_id);");
    const hrv14 = c.indexOf("RAISE EXCEPTION 'Ha % item(ns) por devolver.', v_n USING ERRCODE = 'HRV14',");
    const termina = c.indexOf("UPDATE public.pessoas_vinculos SET estado = 'terminado' WHERE id = v.id;");
    const senao = c.indexOf("ELSE PERFORM set_config('hr.vinculo_via_rpc', 'on', true);");
    expect(hrv10).toBeGreaterThan(0);
    expect(ramo).toBeGreaterThan(hrv10);
    expect(trinco).toBeGreaterThan(ramo);
    expect(conta).toBeGreaterThan(trinco);
    expect(hrv14).toBeGreaterThan(conta);
    expect(termina).toBeGreaterThan(hrv14);
    expect(senao).toBeGreaterThan(termina);
    // uma só contagem e um só trinco (nada no ramo agendado)
    expect(c.match(/pg_advisory_xact_lock/g)).toHaveLength(1);
    expect(c.match(/ativos_itens_por_devolver/g)).toHaveLength(1);
    expect(c).toContain("DETAIL = 'Registe a devolução (ou a perda) de cada item antes de terminar o contrato.'");
  });

  it("decisão do dono: sem aviso no ramo agendado (o sino foi retirado)", () => {
    expect(sql).not.toMatch(/ativos_avisar_saida|notifications|cron\./i);
  });

  it("direitos: os de hoje; PUBLIC e anon sem nada", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.rpc_hr_vinculo_terminar(uuid, text) FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.rpc_hr_vinculo_terminar(uuid, text) TO authenticated;");
    expect(sql).not.toMatch(/TO anon\b/);
  });

  it("os RAISE com % têm tantos argumentos como marcas", () => {
    const raises = [...sql.matchAll(/RAISE (?:EXCEPTION|NOTICE|WARNING) '((?:[^']|'')*)'([^;]*);/g)];
    expect(raises.length).toBeGreaterThan(8);
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

  it("guardas antes e conferência depois; md5 lido a 27/11; HRV14 livre; depende da regra única", () => {
    for (const g of ["G1", "G3", "G4", "G5"]) expect(sql).toContain(`RAISE EXCEPTION '${g}:`);
    for (const c of ["C1", "C2"]) expect(sql).toContain(`RAISE EXCEPTION '${c}:`);
    expect(sql).toContain("md5(p.prosrc::text) = '9a36755d82e19360a2d099f4102ee569'");
    expect(sql).toContain("pg_get_function_identity_arguments(p.oid)::text = 'p_vinculo_id uuid, p_motivo text'");
    expect(sql).toContain("to_regprocedure('public.ativos_itens_por_devolver(uuid, uuid)') IS NULL");
    expect(sql).toContain("p.prosrc ~ 'HRV14'");
  });
});
