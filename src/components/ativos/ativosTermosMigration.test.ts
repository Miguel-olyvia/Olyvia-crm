/**
 * @vitest-environment node
 */
// 27/11: a migration F1.4 dos ATIVOS (20270130300000, termos de entrega e devolução) lida como TEXTO, antes de
// qualquer push. Confere: CRLF, cabeçalho (só base de RH, o que o ecrã tem de fazer, a paridade das variáveis), uma
// só transação, o catálogo de variáveis com os 37 tokens de hoje iguais e pela mesma ordem mais os 8 do ativo, a
// permissão ANTES de ler, ATV36 (momento/linha) e ATV37 (modelo), o documento inserido como em
// rpc_hr_documento_emitir, os textos livres escapados, NADA enviado (sem SMS nem emails), os direitos e as guardas.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270130300000_ativos_termos.sql";
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

/** Os 37 tokens do catálogo lido a 27/11 (md5 1ffd5bfa...), pela ordem em que estão. */
const TOKENS_HOJE = [
  "pessoa_nome_completo", "pessoa_primeiro_nome", "pessoa_apelido", "pessoa_numero_interno", "pessoa_cargo",
  "pessoa_local_trabalho", "pessoa_email_trabalho", "pessoa_telefone_trabalho", "pessoa_data_admissao",
  "pessoa_data_antiguidade", "pessoa_data_nascimento", "pessoa_nacionalidade", "pessoa_estado_civil", "pessoa_nif",
  "pessoa_tipo_documento", "pessoa_numero_documento", "pessoa_validade_documento", "pessoa_niss_ultimos4",
  "pessoa_morada", "pessoa_codigo_postal", "pessoa_localidade", "vinculo_tipo_contrato", "vinculo_regime",
  "vinculo_data_inicio", "vinculo_data_fim", "vinculo_motivo_termo", "vinculo_periodo_experimental_ate",
  "vinculo_horas_semanais", "retribuicao_valor_base", "retribuicao_periodicidade", "retribuicao_moeda",
  "retribuicao_subsidio_alimentacao", "retribuicao_subsidio_alimentacao_modo", "empresa_nome", "documento_titulo",
  "documento_tipo", "documento_data_emissao",
];
const TOKENS_ATIVO = [
  "ativo_codigo", "ativo_nome", "ativo_tipo", "ativo_num_serie", "ativo_entrega_data", "ativo_devolucao_data",
  "ativo_devolucao_estado", "termo_momento",
];

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

  it("carimbo único, entre a lista por devolver e o bloqueio", () => {
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270130300000_"))).toEqual([nome]);
    expect(nome.slice(0, 14) > "20270130200000").toBe(true);
    expect(nome.slice(0, 14) < "20270130400000").toBe(true);
  });

  it("cabeçalho: base de RH, o que o ecrã tem de fazer, paridade das variáveis e nada enviado", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain("O QUE O ECRÃ TEM DE FAZER");
    for (const f of [
      "src/hooks/ativos/useTermoAtivo.ts",
      "rh-exemplo/custo/CustoEquipamentos.tsx",
      "src/components/rh-exemplo/lib/variaveisDocumentoRH.ts",
      "src/utils/hr/variaveisDocumentoRH.ts",
      "TOKENS_CATALOGO_SQL",
      "ativos.erro.ATV36/ATV37",
    ]) {
      expect(bruto, f).toContain(f);
    }
    expect(bruto).toContain("ESTA MIGRATION NÃO ENVIA NADA");
    expect(bruto).toContain("supabase migration list --linked");
  });

  it("uma só transação, com lock_timeout logo no início; só funções", () => {
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
    expect(sql).toMatch(/BEGIN; SET LOCAL lock_timeout = '5s';/);
    expect(sql).not.toMatch(/\b(CREATE|ALTER|DROP) (TABLE|INDEX|TRIGGER|POLICY)\b/i);
    expect(sql).not.toMatch(/ADD (COLUMN|CONSTRAINT)|DROP FUNCTION/i);
    expect(sql).not.toMatch(/cron\.|notifications/i);
  });

  it("catálogo: mesma assinatura e search_path; os 37 tokens de hoje pela mesma ordem e os 8 do ativo no fim", () => {
    const c = corpo("hr_documento_variaveis_catalogo");
    expect(c).toContain(
      "CREATE OR REPLACE FUNCTION public.hr_documento_variaveis_catalogo() RETURNS TABLE(token text, rotulo text, grupo text) LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp",
    );
    const tokens = [...c.matchAll(/\('([a-z0-9_]+)',\s*'[^']*',\s*'([a-z]+)'\)/g)].map((m) => m[1]);
    expect(tokens).toEqual([...TOKENS_HOJE, ...TOKENS_ATIVO]);
    const grupos = [...c.matchAll(/\('([a-z0-9_]+)',\s*'[^']*',\s*'([a-z]+)'\)/g)].filter((m) => TOKENS_ATIVO.includes(m[1])).map((m) => m[2]);
    expect(new Set(grupos)).toEqual(new Set(["ativo"]));
  });

  it("rpc: permissão ANTES de ler; ATV36 momento e linha; ATV37 modelo", () => {
    const c = corpo("rpc_ativos_termo_emitir");
    const perm = c.indexOf("public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.emitir', p_organization_id)");
    expect(perm).toBeGreaterThan(0);
    expect(c.indexOf("FROM public.pessoas_equipamentos pe")).toBeGreaterThan(perm);
    expect(c.indexOf("FROM public.pessoas_documentos_modelos m")).toBeGreaterThan(perm);
    expect(c).toContain("IF p_momento IS NULL OR p_momento NOT IN ('entrega', 'devolucao') THEN");
    // a linha: da organização pedida, com ativo da mesma organização, pessoa viva
    expect(c).toContain("JOIN public.ativo a ON a.id = pe.ativo_id AND a.organization_id = pe.organization_id");
    expect(c).toContain("JOIN public.pessoas p ON p.id = pe.pessoa_id AND p.organization_id = pe.organization_id AND p.deleted_at IS NULL");
    expect(c).toContain("WHERE pe.id = p_pessoa_equipamento_id AND pe.organization_id = p_organization_id;");
    expect(c).toContain("IF p_momento = 'devolucao' AND (v_linha.estado <> 'devolvido' OR v_linha.devolucao IS NULL) THEN");
    expect(c.match(/RAISE EXCEPTION 'ATV36' USING ERRCODE = 'P0001'/g)).toHaveLength(3);
    // o modelo: desta organização, vivo, ativo, recibo, com corpo, sem retribuição
    expect(c).toContain("WHERE m.id = p_modelo_id AND m.organization_id = p_organization_id AND m.deleted_at IS NULL;");
    expect(c).toContain("IF v_modelo.id IS NULL OR NOT v_modelo.activo OR v_modelo.tipo <> 'recibo'");
    expect(c).toContain("v_modelo.corpo_html ~* '\\{\\{\\s*retribuicao_'");
    expect(c.match(/RAISE EXCEPTION 'ATV37' USING ERRCODE = 'P0001'/g)).toHaveLength(1);
  });

  it("rpc: variáveis sem retribuição, textos livres escapados, documento como rpc_hr_documento_emitir, NADA enviado", () => {
    const c = corpo("rpc_ativos_termo_emitir");
    expect(c).toContain("public.hr_documento_variaveis(v_linha.pessoa_id, p_organization_id, false)");
    for (const k of TOKENS_ATIVO) expect(c, k).toContain(`'${k}'`);
    // escape completo (& < > " ') e chavetas, nos três textos livres E na variável documento_titulo (revisão 27/11)
    const escape = (campo: string) =>
      `replace(replace(replace(replace(replace(replace(replace(${campo}, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;'), '{', '&#123;'), '}', '&#125;')`;
    for (const campo of ["v_linha.codigo", "v_linha.nome", "v_linha.num_serie"]) {
      expect(c, campo).toContain(escape(campo));
    }
    expect(c).toContain(`'documento_titulo', ${escape("v_titulo")},`);
    expect(c).not.toContain("'documento_titulo', v_titulo,");
    expect(c).toContain("v_corpo := public.hr_documento_substituir_variaveis(v_modelo.corpo_html, v_variaveis);");
    // sem código, o título usa o nome (titulo é NOT NULL)
    expect(c).toContain("v_titulo := v_modelo.nome || ' · ' || coalesce(v_linha.codigo, v_linha.nome);");
    expect(c).toContain("INSERT INTO public.pessoas_documentos ( pessoa_id, organization_id, modelo_id, tipo, titulo, corpo_html, estado, emitido_em, emitido_por, created_by, updated_by )");
    expect(c).toContain("'a_aguardar_assinatura', now(), v_emissor");
    expect(c).toContain("'documento_id', v_doc, 'pessoa_id', v_linha.pessoa_id, 'titulo', v_titulo, 'estado', 'a_aguardar_assinatura'");
    // nada é enviado daqui: o envio (SMS real) é a rpc que já existe, chamada pelo ecrã
    // (o COMMENT da função nomeia a rpc de envio só para orientar quem lê; o catálogo tem o token pessoa_email_trabalho)
    expect(c).not.toMatch(/portal_documento_enviar|send-sms|sms_|net\.http|pg_net|enviar_email|send_email/i);
    expect(sql).not.toMatch(/PERFORM public\.(rpc_)?hr_portal|net\.http_post|pg_net/i);
  });

  it("direitos: rpc SECURITY DEFINER só para authenticated; o catálogo mantém os direitos de hoje; nada para anon", () => {
    expect(corpo("rpc_ativos_termo_emitir")).toContain("SECURITY DEFINER SET search_path = ''");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.rpc_ativos_termo_emitir(uuid, uuid, text, uuid) FROM PUBLIC, anon, service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.rpc_ativos_termo_emitir(uuid, uuid, text, uuid) TO authenticated;");
    expect(sql).not.toMatch(/(REVOKE|GRANT) [^;]* ON FUNCTION public\.hr_documento_variaveis_catalogo/);
    expect(sql).not.toMatch(/TO anon\b/);
  });

  it("os RAISE com % têm tantos argumentos como marcas", () => {
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

  it("guardas antes e conferência depois; md5 lido a 27/11; catálogo lido com ::text", () => {
    for (const g of ["G1", "G2", "G3", "G4", "G5"]) expect(sql).toContain(`RAISE EXCEPTION '${g}:`);
    for (const c of ["C1", "C2", "C3"]) expect(sql).toContain(`RAISE EXCEPTION '${c}:`);
    expect(sql).toContain("md5(p.prosrc::text) = '1ffd5bfab294386eb22d660a5f241573'");
    expect(sql).toContain("p.prosrc ~ 'ATV3[67]'");
    expect(sql).toContain("IF v_n <> 45 THEN");
    expect(sql).toContain("IF v_n <> 8 THEN");
  });
});
