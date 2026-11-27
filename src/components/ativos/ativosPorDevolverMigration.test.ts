/**
 * @vitest-environment node
 */
// 27/11: a migration F1.1 dos ATIVOS (20270130200000, lista «por devolver») lida como TEXTO, antes de qualquer push.
// Confere: CRLF, cabeçalho (só base de RH, o que o ecrã tem de fazer, a faixa em vez do sino), uma só transação, a
// regra única ativos_itens_por_devolver (ativos do RH e viaturas da Frota só lidas, sempre filtradas pela
// organização), a permissão ANTES de ler, a chefia direta só para o subordinado, o ATV35, uma só consulta sem ciclos
// por pessoa, os direitos e as guardas. Por decisão do dono (v2) NÃO há sino, destinatários, rotina nem cron.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270130200000_ativos_por_devolver.sql";
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
    expect(lf).toBeGreaterThan(200);
    expect(crlf).toBe(lf);
  });

  it("carimbo único, depois da F1.0 e antes do bloqueio que depende dele", () => {
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270130200000_"))).toEqual([nome]);
    expect(nome.slice(0, 14) > "20270130100000").toBe(true);
    expect(nome.slice(0, 14) < "20270130400000").toBe(true);
  });

  it("cabeçalho: base de RH, o que o ecrã tem de fazer, faixa em vez do sino, ordem de aplicação", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain("O QUE O ECRÃ TEM DE FAZER");
    for (const f of ["src/hooks/ativos/useAtivosPorDevolver.ts", "src/pages/ativos/Ativos.tsx", "FAIXA", "ativos.erro.ATV35", "ativos.saidas.semNome"]) {
      expect(bruto, f).toContain(f);
    }
    expect(bruto).toContain("o AVISO NO SINO FOI RETIRADO");
    expect(bruto).toContain("ORDEM DE APLICAÇÃO");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("20270130400000_hr_vinculo_terminar_por_devolver");
  });

  it("uma só transação, com lock_timeout logo no início", () => {
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
    expect(sql).toMatch(/BEGIN; SET LOCAL lock_timeout = '5s';/);
  });

  it("decisão do dono: sem sino, destinatários, rotina diária nem cron; só funções, nada escrito", () => {
    expect(sql).not.toMatch(/notifications|cron\.|ativos_avisar_saida|ativos_rotina_diaria|ativos_utilizadores_com_permissao|alert_settings/i);
    expect(sql).not.toMatch(/\b(CREATE|ALTER|DROP) (TABLE|INDEX|TRIGGER|POLICY)\b/i);
    expect(sql).not.toMatch(/ADD (COLUMN|CONSTRAINT)|DROP FUNCTION/i);
    expect(sql).not.toMatch(/\b(INSERT INTO|UPDATE public\.|DELETE FROM)\b/i);
  });

  it("a regra única: ativos atribuídos e viaturas da Frota, sempre da organização pedida", () => {
    const c = corpo("ativos_itens_por_devolver");
    expect(c).toContain(
      "CREATE FUNCTION public.ativos_itens_por_devolver(p_org uuid, p_pessoa_id uuid) RETURNS TABLE(pessoa_id uuid, origem text, item_id uuid, ref_id uuid, codigo text, nome text, desde date) LANGUAGE sql STABLE SET search_path = ''",
    );
    expect(c).not.toContain("SECURITY DEFINER");
    // ativos do RH
    expect(c).toContain("JOIN public.ativo a ON a.id = pe.ativo_id AND a.organization_id = pe.organization_id");
    expect(c).toContain("WHERE pe.organization_id = p_org");
    expect(c).toContain("AND pe.estado = 'atribuido'");
    // Frota: só lida, organização em cada junção, sem devolução nem cancelamento
    expect(c).toContain("JOIN public.fleet_drivers fd ON fd.id = fa.driver_id AND fd.organization_id = fa.organization_id");
    expect(c).toContain("JOIN public.fleet_vehicles fv ON fv.id = fa.vehicle_id AND fv.organization_id = fa.organization_id AND fv.deleted_at IS NULL");
    expect(c).toContain("WHERE fa.organization_id = p_org");
    expect(c).toContain("AND fa.returned_on IS NULL AND fa.cancelled_at IS NULL");
    // p_pessoa_id NULL = toda a organização (a lista chama uma vez só)
    expect(c.match(/\(p_pessoa_id IS NULL OR (pe|fd)\.pessoa_id = p_pessoa_id\)/g)).toHaveLength(2);
  });

  it("rpc: permissão ANTES de ler dados; chefia direta só para o subordinado pedido; senão 42501", () => {
    const c = corpo("rpc_ativos_por_devolver");
    expect(c).toContain("p_organization_id uuid, p_pessoa_id uuid DEFAULT NULL, p_dias integer DEFAULT 90 ) RETURNS jsonb");
    const perm = c.indexOf("public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.view', p_organization_id)");
    const ver = c.indexOf("public.has_anew_permission_in_org(v_uid, 'ativos.view', p_organization_id)");
    const leitura = c.indexOf("WITH saidas AS");
    expect(perm).toBeGreaterThan(0);
    expect(ver).toBeGreaterThan(perm);
    expect(leitura).toBeGreaterThan(c.indexOf("RAISE EXCEPTION 'ATV35'"));
    expect(c.indexOf("RAISE EXCEPTION 'ATV35'")).toBeGreaterThan(c.lastIndexOf("RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501'"));
    // chefia: pessoa -> reporta_a -> conta ativa -> utilizador -> membership ativo, mesma organização
    expect(c).toContain("v_chefia := p_pessoa_id IS NOT NULL AND EXISTS (");
    expect(c).toContain("ON pc.pessoa_id = p.reporta_a_pessoa_id AND pc.organization_id = p.organization_id AND pc.estado = 'activa'");
    expect(c).toContain("ON au.id = pc.anew_user_id AND au.auth_user_id = v_uid AND au.deleted_at IS NULL");
    expect(c).toContain("ON am.user_id = au.id AND am.organization_id = p.organization_id AND am.status = 'active'");
    expect(c).toContain("WHERE p.id = p_pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL");
    // o nome só a quem o pode ver
    expect(c).toContain("'nome', CASE WHEN v_ve_nome THEN pp.nome_completo END");
  });

  it("rpc (revisão de segurança 27/11): detalhe só com vínculos E retribuição; o resto só contagens; nome com hr.pessoas.view; Frota com fleet.view", () => {
    const c = corpo("rpc_ativos_por_devolver");
    // a porta de rpc_ativos_listar para «quem tem o quê»
    expect(c).toContain(
      "v_detalhe := coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.view', p_organization_id), false) AND coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.view', p_organization_id), false);",
    );
    // só ativos.view ou só vínculos: contagens da organização inteira, nunca de uma pessoa pedida
    expect(c).toContain(
      "v_contagem := coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.view', p_organization_id), false) OR coalesce(public.has_anew_permission_in_org(v_uid, 'ativos.view', p_organization_id), false);",
    );
    expect(c).toContain("IF NOT v_chefia AND NOT (v_contagem AND p_pessoa_id IS NULL) THEN");
    expect(c).toContain("'pessoas', CASE WHEN NOT v_detalhe THEN '[]'::jsonb ELSE coalesce(jsonb_agg(");
    expect(c).toContain("'detalhe', v_detalhe");
    expect(c).toContain("v_detalhe := v_detalhe OR v_chefia;");
    // o nome: hr.pessoas.view ou chefia; ativos.edit já não dá o nome
    expect(c).toContain("v_ve_nome := v_chefia OR coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view', p_organization_id), false);");
    expect(c).not.toContain("'ativos.edit'");
    // Frota só com fleet.view, também fora das contagens
    expect(c).toContain("v_ve_frota := coalesce(public.has_anew_permission_in_org(v_uid, 'fleet.view', p_organization_id), false);");
    expect(c).toContain("WHERE i.origem <> 'frota' OR v_ve_frota");
  });

  it("regra única: uma reserva da Frota que ainda não começou não está por devolver", () => {
    expect(corpo("ativos_itens_por_devolver")).toContain("AND fa.starts_on <= public.ativos_hoje() AND fa.returned_on IS NULL");
  });

  it("rpc: uma só consulta, sem ciclos por pessoa; só pessoas com itens; ordenada pela saída", () => {
    const c = corpo("rpc_ativos_por_devolver");
    expect(c).not.toMatch(/\b(LOOP|FOREACH|FOR \w+ IN)\b/);
    expect(c.match(/public\.ativos_itens_por_devolver\(/g)).toHaveLength(1);
    expect(c).toContain("FROM public.ativos_itens_por_devolver(p_organization_id, p_pessoa_id) i");
    expect(c).toContain("WHERE p.organization_id = p_organization_id AND p.deleted_at IS NULL");
    expect(c).toContain("AND coalesce(p.data_saida, v.data_fim) <= v_hoje + p_dias");
    expect(c).toContain("ON v.pessoa_id = p.id AND v.organization_id = p.organization_id AND v.deleted_at IS NULL AND v.estado IN ('activo', 'suspenso')");
    expect(c).toContain("JOIN itens i ON i.pessoa_id = s.pessoa_id");
    expect(c).toContain("ORDER BY pp.saida, pp.pessoa_id");
    for (const k of ["'hoje'", "'dias'", "'total_pessoas'", "'total_itens'", "'pessoas'", "'saida_prevista'", "'origem'", "'dias_restantes'", "'vinculo_id'", "'chefia_pessoa_id'", "'n_itens'", "'itens'", "'item_id'", "'ref_id'", "'codigo'", "'desde'"]) {
      expect(c, k).toContain(k);
    }
    for (const o of ["'data_saida'", "'fim_decidido'", "'fim_contrato'"]) expect(c, o).toContain(o);
  });

  it("direitos: rpc SECURITY DEFINER só para authenticated; a interna para ninguém; nada para anon", () => {
    expect(corpo("rpc_ativos_por_devolver")).toContain("SECURITY DEFINER SET search_path = ''");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.rpc_ativos_por_devolver(uuid, uuid, integer) FROM PUBLIC, anon, service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.rpc_ativos_por_devolver(uuid, uuid, integer) TO authenticated;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.ativos_itens_por_devolver(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;");
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.ativos_itens_por_devolver\(/);
    expect(sql).not.toMatch(/TO anon\b/);
  });

  it("o código de erro novo ATV35 existe, com P0001 e texto em pt-PT; p_dias de 0 a 365", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'ATV35' USING ERRCODE = 'P0001', DETAIL = '[^']+'/);
    expect(corpo("rpc_ativos_por_devolver")).toContain("IF p_dias IS NULL OR p_dias < 0 OR p_dias > 365 THEN");
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

  it("guardas antes e conferência depois; catálogo lido com ::text", () => {
    for (const g of ["G1", "G2", "G3", "G4", "G5"]) expect(sql).toContain(`RAISE EXCEPTION '${g}:`);
    for (const c of ["C1", "C2"]) expect(sql).toContain(`RAISE EXCEPTION '${c}:`);
    expect(sql).toContain("p.prosrc ~ 'ATV35'");
    expect(sql).toContain("a.attname::text = x.coluna");
    expect(sql).toContain("array_to_string(p.proconfig, ',')::text = 'search_path=\"\"'");
    expect(sql).toContain("PERFORM count(*) FROM public.ativos_itens_por_devolver('b6ffce4f-f630-4933-833a-008649757a33', NULL);");
  });
});
