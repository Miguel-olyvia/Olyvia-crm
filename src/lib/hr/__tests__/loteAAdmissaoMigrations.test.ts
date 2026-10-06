/**
 * O CONTEUDO DAS TRES MIGRATIONS DO LOTE A (admissao, base e servidor).
 *
 * 20261210010000  NIF/NISS pelo digito de controlo
 * 20261210020000  as tres posicoes (convite, ficha, opcional) e os campos do RH
 * 20261210030000  recusas, heranca do rascunho, codigos de erro, limpeza
 *
 * O BIC (20261210040000) tem o seu proprio ficheiro, loteBBicMigrations.test.ts;
 * aqui ficam so as assercoes de "a versao mais recente" que o tocam. Os
 * auxiliares sao partilhados em migrationSql.ts.
 *
 * Excepcao deliberada a regra "nao testar SQL por texto" (a mesma de
 * conviteAdmissaoContrato.test.ts): isto NAO testa comportamento de SQL --
 * esse fica nos blocos de conferir das proprias migrations, que correm contra
 * o Postgres no `db push`. Testa o que nenhum compilador ve e que se desfaz em
 * silencio quando um lado muda e o outro nao:
 *
 *   - o contrato de codigos de erro (mensagem + SQLSTATE) entre a base e o que
 *     a Edge Function e o TypeScript vao ler;
 *   - as listas de campos de admissao e de permissoes por campo, que tem de
 *     cobrir os mesmos codigos (senao o JOIN das pendencias deita um fora);
 *   - os privilegios que nao podem alargar (so service_role);
 *   - a promessa da lista branca do convite.
 *
 * Le sempre a migration pelo nome, e para as funcoes antigas a MAIS RECENTE
 * por ordem de nome.
 */
import { describe, expect, it } from "vitest";
import { CODIGOS_PUBLICOS } from "../../../../supabase/functions/convite-admissao/erros";
import {
  MIGRATIONS,
  camposObrigatoriosDe,
  corpoDaFuncao,
  migrationPorVersao,
  migrationQueDefine,
  padraoDeCriacao,
  semComentarios,
  temComando,
} from "./migrationSql";

const M1 = migrationPorVersao("20261210010000");
const M2 = migrationPorVersao("20261210020000");
const M3 = migrationPorVersao("20261210030000");
const M4 = migrationPorVersao("20261210040000");

// -----------------------------------------------------------------------------
// O contrato de codigos de erro
// -----------------------------------------------------------------------------

/** Mensagem da excepcao -> SQLSTATE. A mensagem e EXACTAMENTE o codigo. */
const SQLSTATE_POR_CODIGO: Readonly<Record<string, string>> = {
  convite_invalido: "HRA01",
  convite_ja_usado: "HRA02",
  convite_revogado: "HRA03",
  convite_expirado: "HRA04",
  convite_bloqueado: "HRA05",
  pedido_invalido: "HRA10",
  nif_invalido: "HRA11",
  niss_invalido: "HRA12",
  nif_ja_existe: "HRA13",
  niss_ja_existe: "HRA14",
  pais_invalido: "HRA15",
  iban_invalido: "HRA16",
  admissao_incompleta: "HRA17",
  bic_invalido: "HRA18",
  pessoa_nao_encontrada: "HRA30",
};

const RAISE_COM_ERRCODE = /RAISE EXCEPTION '([a-z_]+)'\s+USING ERRCODE = '([A-Z0-9]{5})'/g;

function raisesDe(corpo: string): Array<[string, string]> {
  return [...corpo.matchAll(RAISE_COM_ERRCODE)].map((m): [string, string] => [m[1], m[2]]);
}

describe("o contrato de codigos de erro (20261210030000, com o BIC de 20261210040000)", () => {
  // A versao MAIS RECENTE de submeter: o contrato e o dela, nao o de M3.
  const corpoSubmeter = corpoDaFuncao(
    migrationQueDefine("rpc_hr_convite_admissao_submeter"),
    "rpc_hr_convite_admissao_submeter",
  );

  it("submeter lanca exactamente os codigos do contrato, cada um com o seu SQLSTATE", () => {
    const lancados = raisesDe(corpoSubmeter);
    const esperados = Object.entries(SQLSTATE_POR_CODIGO).filter(
      ([codigo]) => codigo !== "pessoa_nao_encontrada",
    );

    for (const [codigo, sqlstate] of lancados) {
      expect(SQLSTATE_POR_CODIGO[codigo], `codigo desconhecido ${codigo}`).toBe(sqlstate);
    }
    // Todos os do contrato (menos o das RPCs do RH) sao lancados por submeter.
    expect(new Set(lancados.map(([c]) => c))).toEqual(new Set(esperados.map(([c]) => c)));
  });

  it("nenhum RAISE de submeter ficou sem SQLSTATE proprio", () => {
    const todos = [...corpoSubmeter.matchAll(/RAISE EXCEPTION '/g)].length;
    expect(raisesDe(corpoSubmeter).length).toBe(todos);
  });

  it("os duplicados levam os pessoa_id no DETAIL e o portao leva os campos", () => {
    expect(corpoSubmeter).toMatch(/RAISE EXCEPTION 'nif_ja_existe' USING ERRCODE = 'HRA13', DETAIL = v_ids_nif/);
    expect(corpoSubmeter).toMatch(/RAISE EXCEPTION 'niss_ja_existe' USING ERRCODE = 'HRA14', DETAIL = v_ids_niss/);
    expect(corpoSubmeter).toMatch(
      /RAISE EXCEPTION 'admissao_incompleta' USING ERRCODE = 'HRA17', DETAIL = array_to_string\(v_faltam, ','\)/,
    );
  });

  it("o formato legado 'admissao_incompleta: lista' ja nao e lancado", () => {
    expect(corpoSubmeter).not.toMatch(/admissao_incompleta: %/);
  });

  it("o NIF e o NISS sao validados pelo digito de controlo ANTES dos duplicados", () => {
    const posNif = corpoSubmeter.indexOf("hr_nif_valido");
    const posNiss = corpoSubmeter.indexOf("hr_niss_valido");
    const posDuplicados = corpoSubmeter.indexOf("hr_pessoa_duplicados_candidatos");
    expect(posNif).toBeGreaterThan(0);
    expect(posNiss).toBeGreaterThan(0);
    expect(posNif).toBeLessThan(posDuplicados);
    expect(posNiss).toBeLessThan(posDuplicados);
  });

  it("o motivo do convite que nao se consome e lido da linha", () => {
    expect(corpoSubmeter).toMatch(/v_lido\.used_at IS NOT NULL[\s\S]*'convite_ja_usado'/);
    expect(corpoSubmeter).toMatch(/v_lido\.revoked_at IS NOT NULL[\s\S]*'convite_revogado'/);
    expect(corpoSubmeter).toMatch(/v_lido\.valid_until <= now\(\)[\s\S]*'convite_expirado'/);
  });

  it("o portao so trava os campos que a pessoa preenche no convite", () => {
    expect(corpoSubmeter).toMatch(/pend\.origem = 'pessoa'\s+AND pend\.posicao = 'convite'/);
  });

  it("as RPCs do RH recusam com os codigos do contrato", () => {
    for (const nome of [
      "rpc_hr_convite_admissao_criar",
      "rpc_hr_convite_admissao_resumo",
      "rpc_hr_convite_admissao_conflitos",
    ]) {
      const corpo = corpoDaFuncao(M3, nome);
      expect(corpo, nome).toMatch(/RAISE EXCEPTION 'pessoa_nao_encontrada' USING ERRCODE = 'HRA30'/);
      expect(corpo, nome).toMatch(/RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501'/);
    }
    expect(corpoDaFuncao(M3, "rpc_hr_convite_admissao_criar")).toMatch(
      /RAISE EXCEPTION 'validade_invalida' USING ERRCODE = '22023'/,
    );
  });

  it("os SQLSTATE da classe HRA nao colidem com os HR9xx ja usados", () => {
    for (const sqlstate of Object.values(SQLSTATE_POR_CODIGO)) {
      expect(sqlstate).toMatch(/^HRA[0-9]{2}$/);
    }
    expect(new Set(Object.values(SQLSTATE_POR_CODIGO)).size).toBe(
      Object.values(SQLSTATE_POR_CODIGO).length,
    );
  });
});

describe("migration 20261210010000 -- NIF e NISS", () => {
  it("o trigger valida so os dois campos e usa os SQLSTATE HRA11 e HRA12", () => {
    expect(M1).toMatch(/BEFORE INSERT OR UPDATE OF nif, niss ON public\.pessoas_identificacao/);
    expect(M1).toMatch(/RAISE EXCEPTION 'nif_invalido' USING ERRCODE = 'HRA11'/);
    expect(M1).toMatch(/RAISE EXCEPTION 'niss_invalido' USING ERRCODE = 'HRA12'/);
  });

  it("so valida quando o valor muda (o legado continua editavel)", () => {
    expect(M1).toMatch(/NEW\.nif IS DISTINCT FROM OLD\.nif/);
    expect(M1).toMatch(/NEW\.niss IS DISTINCT FROM OLD\.niss/);
    expect(M1).not.toMatch(/ADD CONSTRAINT[^;]*hr_nif_valido/);
  });

  it("as duas funcoes puras estao fechadas a anon e a funcao do trigger a todos", () => {
    expect(temComando(M1, "REVOKE ALL ON FUNCTION public.hr_nif_valido(text) FROM anon;")).toBe(true);
    expect(temComando(M1, "REVOKE ALL ON FUNCTION public.hr_niss_valido(text) FROM anon;")).toBe(true);
    expect(
      temComando(M1, "REVOKE ALL ON FUNCTION public.hr_identificacao_validar_numeros() FROM authenticated;"),
    ).toBe(true);
  });

  it("o conferir conta o legado SO na organizacao nike", () => {
    expect(M1).toContain("b6ffce4f-f630-4933-833a-008649757a33");
    expect(M1).toMatch(/WHERE i\.organization_id = c_org_nike/);
  });
});

// -----------------------------------------------------------------------------
// As tres posicoes
// -----------------------------------------------------------------------------

function camposObrigatorios(sql: string = M2) {
  return camposObrigatoriosDe(sql);
}

describe("migration 20261210020000 -- as tres posicoes", () => {
  it("a base declara 28 campos de origem 'pessoa' e os 5 fixos de origem 'rh'", () => {
    const campos = camposObrigatorios();
    expect(campos.filter((c) => c.origem === "pessoa")).toHaveLength(28);
    expect(
      campos
        .filter((c) => c.origem === "rh")
        .map((c) => c.codigo)
        .sort(),
    ).toEqual(["cargo", "data_admissao", "duodecimos", "subsidio_alimentacao", "tipo_contrato"]);
  });

  it("a lista de 28 campos de M2 foi superada pela de M4 (20261210040000, o BIC)", () => {
    expect(migrationQueDefine("hr_admissao_campos_obrigatorios")).toBe(M4);
    expect(migrationQueDefine("hr_admissao_campo_permissao")).toBe(M4);
    expect(migrationQueDefine("hr_admissao_pendencias")).toBe(M4);
  });

  it("o gancho do horario esta comentado e nao entrou como linha", () => {
    expect(camposObrigatorios().some((c) => c.codigo === "tipo_horario")).toBe(false);
    expect(M2).toMatch(/GANCHO: o campo tipo_horario/);
  });

  it("todo o campo de admissao tem permissao associada (senao o JOIN deita-o fora)", () => {
    const corpo = corpoDaFuncao(M2, "hr_admissao_campo_permissao");
    const comPermissao = new Set(
      [...corpo.matchAll(/\('([a-z0-9_]+)',\s*'[a-z_]+',\s*'hr\.[a-z.]+'\)/g)].map((m) => m[1]),
    );
    for (const campo of camposObrigatorios()) {
      expect(comPermissao.has(campo.codigo), `sem permissao: ${campo.codigo}`).toBe(true);
    }
  });

  it("os campos novos do RH exigem a permissao da tabela de origem", () => {
    const corpo = corpoDaFuncao(M2, "hr_admissao_campo_permissao");
    expect(corpo).toMatch(/'cargo',\s+'pessoas',\s+'hr\.pessoas\.view'/);
    expect(corpo).toMatch(/'tipo_contrato',\s+'pessoas_vinculos',\s+'hr\.pessoas\.vinculos\.view'/);
    expect(corpo).toMatch(/'subsidio_alimentacao',\s+'pessoas_retribuicoes',\s+'hr\.pessoas\.retribuicao\.view'/);
    expect(corpo).toMatch(/'duodecimos',\s+'pessoas_retribuicoes',\s+'hr\.pessoas\.retribuicao\.view'/);
  });

  it("o validador aceita as tres posicoes e, por tolerancia, boolean; rejeita o resto", () => {
    const corpo = corpoDaFuncao(M2, "hr_admissao_campos_override_validos");
    expect(corpo).toMatch(/IN \('convite', 'ficha', 'opcional'\)/);
    expect(corpo).toMatch(/jsonb_typeof\(chave\.valor\) = 'boolean'/);
    expect(corpo).toMatch(/c\.origem = 'pessoa'/);
  });

  it("a conversao dos dados corre entre largar e voltar a por o CHECK", () => {
    const largar = M2.indexOf("DROP CONSTRAINT IF EXISTS organization_admissao_settings_override_valido");
    const converter = M2.indexOf("UPDATE public.organization_admissao_settings");
    const validador = M2.indexOf("CREATE OR REPLACE FUNCTION public.hr_admissao_campos_override_validos");
    const repor = M2.indexOf("ADD CONSTRAINT organization_admissao_settings_override_valido");
    expect(largar).toBeGreaterThan(0);
    expect(largar).toBeLessThan(converter);
    expect(converter).toBeLessThan(validador);
    expect(validador).toBeLessThan(repor);
  });

  it("as funcoes _org devolvem a posicao, e a de configuracao continua so service_role", () => {
    expect(M2).toMatch(/posicao\s+text,\s+obrigatorio\s+boolean,\s+configuravel\s+boolean/);
    expect(
      temComando(M2, "REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) FROM authenticated;"),
    ).toBe(true);
    expect(
      temComando(M2, "GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) TO service_role;"),
    ).toBe(true);
    expect(
      temComando(M2, "GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios_org(uuid) TO authenticated;"),
    ).toBe(false);
  });

  it("as posicoes dos campos do RH sao sempre 'ficha'", () => {
    const corpo = corpoDaFuncao(M2, "hr_admissao_campos_obrigatorios_org");
    expect(corpo).toMatch(/WHEN c\.origem = 'rh' THEN 'ficha'/);
    expect(corpo).toMatch(/\(c\.origem = 'pessoa'\)\s+AS configuravel/);
  });

  it("a RPC de posicoes tem o gate baixo: criar OU editar pessoa", () => {
    const corpo = corpoDaFuncao(M2, "rpc_hr_admissao_posicoes_campos");
    expect(corpo).toMatch(/'hr\.pessoas\.create'/);
    expect(corpo).toMatch(/'hr\.pessoas\.edit'/);
    expect(corpo).toMatch(/OR\s+public\.has_anew_permission_in_org/);
    expect(corpo).toMatch(/ERRCODE = '42501'/);
    expect(corpo).not.toMatch(/c\.obrigatorio/);
  });

  it("as pendencias ignoram o opcional e leem cargo, contrato e retribuicao aberta", () => {
    const corpo = corpoDaFuncao(M2, "hr_admissao_pendencias");
    expect(corpo).toMatch(/c\.posicao IN \('convite', 'ficha'\)/);
    expect(corpo).not.toMatch(/c\.obrigatorio/);
    expect(corpo).toMatch(/p\.cargo_id::text\s+AS cargo/);
    expect(corpo).toMatch(/vv\.deleted_at IS NULL\s+AND vv\.estado IN \('activo', 'futuro'\)/);
    expect(corpo).toMatch(/rr\.valido_ate IS NULL\s+AND rr\.deleted_at IS NULL/);
    expect(corpo).toMatch(/rr\.duodecimos_pct::text\s+AS duodecimos/);
    // Mantem o resto: gate, ramo de servico, excepcoes.
    expect(corpo).toMatch(/v_servico/);
    expect(corpo).toMatch(/insufficient_privilege/);
    expect(corpo).toMatch(/c\.codigo <> 'validade_documento'/);
    expect(corpo).toMatch(/c\.codigo <> 'nif'/);
  });

  it("o estado do convite so leva os campos que a pessoa preenche", () => {
    const corpo = corpoDaFuncao(M2, "rpc_hr_convite_admissao_estado");
    expect(corpo).toMatch(/o\.origem = 'pessoa' AND o\.posicao = 'convite'/);
    expect(corpo).toMatch(/niss_ultimos4/);
    expect(corpo).not.toMatch(/v_ident\.niss,/);
  });

  it("os duodecimos passam a ter 50 por omissao", () => {
    expect(M2).toMatch(/ALTER COLUMN duodecimos_pct SET DEFAULT 50/);
  });

  it("o conferir testa o override so na organizacao nike", () => {
    expect(M2).toContain("b6ffce4f-f630-4933-833a-008649757a33");
    expect(M2).not.toMatch(/FROM public\.anew_organizations LIMIT 1/);
  });

  it("o cabecalho avisa que precisa de codigo novo", () => {
    expect(M2).toMatch(/PRECISA DE CODIGO NOVO NO MESMO COMMIT/);
    expect(M2).toMatch(/updated_by e updated_at preservados/);
  });
});

// -----------------------------------------------------------------------------
// Recusas, heranca e limpeza
// -----------------------------------------------------------------------------

describe("migration 20261210030000 -- recusas, heranca e limpeza", () => {
  it("as colunas novas tem grant de SELECT por coluna e o CHECK do tamanho do erro", () => {
    const grant =
      /GRANT SELECT \(([^)]*)\) ON TABLE public\.pessoas_convites_admissao TO authenticated/.exec(M3);
    expect(grant).not.toBeNull();
    const colunasComGrant = grant === null ? "" : grant[1];
    for (const coluna of [
      "email_enviado",
      "email_enviado_em",
      "email_erro",
      "ultima_recusa_codigo",
      "ultima_recusa_em",
      "ultima_recusa_campos",
    ]) {
      expect(M3, coluna).toMatch(new RegExp("ADD COLUMN IF NOT EXISTS " + coluna + "\\s"));
      expect(colunasComGrant, coluna).toContain(coluna);
    }
    // A coluna dos conflitos existe, mas NAO tem grant: so a RPC SECURITY
    // DEFINER dos conflitos (com o gate de identificacao) a le.
    expect(M3).toMatch(/ADD COLUMN IF NOT EXISTS ultima_recusa_conflitos\s/);
    expect(colunasComGrant).not.toMatch(/ultima_recusa_conflitos/);
    expect(M3).toMatch(/length\(email_erro\) <= 500/);
    // As colunas fechadas nao ganham grant nenhum.
    expect(colunasComGrant).not.toMatch(/token_hash/);
    expect(colunasComGrant).not.toMatch(/rascunho/);
  });

  it("as RPCs de escrita do registo sao so service_role", () => {
    for (const assinatura of [
      "rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)",
      "rpc_hr_convite_admissao_registar_envio(uuid, boolean, text)",
      "rpc_hr_convite_admissao_registar_recusa(text, text, text[], uuid[])",
      "rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)",
      "hr_convites_admissao_limpar()",
    ]) {
      expect(temComando(M3, `REVOKE ALL ON FUNCTION public.${assinatura} FROM authenticated;`), assinatura).toBe(true);
      expect(temComando(M3, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO service_role;`), assinatura).toBe(true);
      expect(temComando(M3, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated;`), assinatura).toBe(false);
    }
  });

  it("criar e so service_role, com p_actor: a de 4 argumentos e largada e nunca recriada", () => {
    const assinatura = "rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)";
    for (const quem of ["PUBLIC", "anon", "authenticated"]) {
      expect(temComando(M3, `REVOKE ALL ON FUNCTION public.${assinatura} FROM ${quem};`), quem).toBe(true);
    }
    expect(
      temComando(M3, "DROP FUNCTION IF EXISTS public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text);"),
    ).toBe(true);
    // Nenhum GRANT a authenticated, de nenhuma assinatura, e nenhum CREATE da de 4 argumentos.
    expect(semComentarios(M3).replace(/\s+/g, " ")).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.rpc_hr_convite_admissao_criar\([^)]*\) TO authenticated/,
    );
    expect(M3).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION public\.rpc_hr_convite_admissao_criar\(\s*p_pessoa_id\s+uuid,\s*p_token_hash\s+text,\s*p_valid_until\s+timestamptz,\s*p_email\s+text\s*\)/);
  });

  it("criar usa p_actor (id de auth.users): a permissao e o created_by saem dele", () => {
    const corpo = semComentarios(corpoDaFuncao(M3, "rpc_hr_convite_admissao_criar"));
    expect(M3).toMatch(/RETURNS TABLE \(convite_id uuid, rascunho_herdado boolean\)/);
    expect(corpo).toMatch(/has_anew_permission_in_org\(p_actor, 'hr\.pessoas\.convite\.enviar', v_org\)/);
    expect(corpo).toMatch(/p_actor IS NULL/);
    expect(corpo).toMatch(/au\.auth_user_id = p_actor/);
    expect(corpo).not.toMatch(/auth\.uid\(\)/);
    expect(corpo).not.toMatch(/p_actor_id/);
  });

  it("as RPCs do RH (resumo, conflitos) ficam abertas a authenticated, nunca a anon", () => {
    for (const assinatura of [
      "rpc_hr_convite_admissao_resumo(uuid)",
      "rpc_hr_convite_admissao_conflitos(uuid)",
    ]) {
      expect(temComando(M3, `REVOKE ALL ON FUNCTION public.${assinatura} FROM anon;`), assinatura).toBe(true);
      expect(temComando(M3, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated;`), assinatura).toBe(true);
    }
  });

  it("a recusa so aceita os codigos de recusa de submissao e so os duplicados contam em attempts", () => {
    const corpo = corpoDaFuncao(
      migrationQueDefine("rpc_hr_convite_admissao_registar_recusa"),
      "rpc_hr_convite_admissao_registar_recusa",
    );
    for (const codigo of [
      "nif_invalido",
      "niss_invalido",
      "nif_ja_existe",
      "niss_ja_existe",
      "pais_invalido",
      "iban_invalido",
      "bic_invalido",
      "admissao_incompleta",
      "assinatura_obrigatoria",
      "pedido_invalido",
    ]) {
      expect(corpo, codigo).toContain(`'${codigo}'`);
    }
    const codigo = semComentarios(corpo);
    // Os duplicados contam, com o tecto das aberturas falhadas; as outras recusas nao.
    expect(codigo).toMatch(
      /attempts = CASE WHEN p_codigo IN \('nif_ja_existe', 'niss_ja_existe'\)\s+THEN least\(attempts \+ 1, c_tecto\)\s+ELSE attempts END/,
    );
    expect(codigo).toMatch(/c_tecto\s+constant integer := 10/);
    expect(corpo).toMatch(/p\.organization_id = v_convite\.organization_id/);
    expect(corpo).toMatch(/c\.used_at IS NULL\s+AND c\.revoked_at IS NULL/);
  });

  it("registar_envio e registar_recusa devolvem boolean, e a Edge Function e quem trata o false", () => {
    for (const nome of ["rpc_hr_convite_admissao_registar_envio", "rpc_hr_convite_admissao_registar_recusa"]) {
      const inicio = M3.search(padraoDeCriacao(nome));
      expect(M3.slice(inicio, inicio + 400), nome).toMatch(/RETURNS boolean/);
    }
    const envio = corpoDaFuncao(M3, "rpc_hr_convite_admissao_registar_envio");
    expect(envio).toMatch(/GET DIAGNOSTICS v_n = ROW_COUNT;\s+RETURN v_n > 0;/);
  });

  it("o resumo e os conflitos so mostram identificacao com hr.pessoas.identificacao.view", () => {
    const resumo = semComentarios(corpoDaFuncao(M3, "rpc_hr_convite_admissao_resumo"));
    expect(resumo).toMatch(/'hr\.pessoas\.identificacao\.view'/);
    expect(resumo).toMatch(/'tem_conflitos',\s+\(v_ident AND v_c\.tem_conflitos\)/);
    expect(resumo).toMatch(/u\.campo NOT IN \('nif', 'niss'\)/);
    const conflitos = semComentarios(corpoDaFuncao(M3, "rpc_hr_convite_admissao_conflitos"));
    expect(conflitos).toMatch(
      /NOT public\.has_anew_permission_in_org\(auth\.uid\(\), 'hr\.pessoas\.identificacao\.view', v_org\)\s+THEN\s+RETURN;/,
    );
  });

  it("submeter compara com a ficha ja gravada (coalesce) antes de procurar duplicados", () => {
    const corpo = corpoDaFuncao(migrationQueDefine("rpc_hr_convite_admissao_submeter"), "rpc_hr_convite_admissao_submeter");
    expect(corpo).toMatch(/coalesce\(public\.hr_json_texto\(p_dados, 'nif'\), i\.nif\)/);
    expect(corpo).toMatch(/coalesce\(public\.hr_json_texto\(p_dados, 'niss'\), i\.niss\)/);
  });

  it("o resumo nunca devolve token, rascunho, IP nem user-agent", () => {
    const corpo = corpoDaFuncao(M3, "rpc_hr_convite_admissao_resumo");
    const resposta = semComentarios(
      corpo.slice(corpo.indexOf("RETURN jsonb_build_object('existe', false)")),
    );
    expect(resposta).not.toMatch(/token_hash/);
    expect(resposta).not.toMatch(/assinatura_ip/);
    expect(resposta).not.toMatch(/user_agent/);
    expect(resposta).not.toMatch(/v_c\.rascunho/);
    expect(resposta).toMatch(/'tem_rascunho',\s+v_c\.tem_rascunho/);
    expect(corpo).toMatch(/'hr\.pessoas\.view'/);
  });

  it("criar herda o rascunho so com o mesmo email, e depois move-o", () => {
    const corpo = corpoDaFuncao(M3, "rpc_hr_convite_admissao_criar");
    expect(corpo).toMatch(/lower\(v_antigo\.email_destino\) = lower\(p_email\)/);
    expect(corpo).toMatch(/c_heranca constant interval := interval '7 days'/);
    const revogar = corpo.indexOf("SET revoked_at = now()");
    const mover = corpo.indexOf("SET rascunho = NULL");
    const inserir = corpo.indexOf("INSERT INTO public.pessoas_convites_admissao");
    expect(revogar).toBeGreaterThan(0);
    expect(revogar).toBeLessThan(mover);
    expect(mover).toBeLessThan(inserir);
    expect(corpo).toMatch(/created_by, rascunho\)/);
  });

  it("a limpeza usa 7 dias e fica agendada as 03:40 sem nunca falhar a migration", () => {
    const corpo = corpoDaFuncao(M3, "hr_convites_admissao_limpar");
    expect(corpo).toMatch(/c_carencia constant interval := interval '7 days'/);
    expect(corpo).not.toMatch(/30 days/);
    expect(corpo).toMatch(/used_at IS NULL/);
    expect(M3).toMatch(/'hr-convites-admissao-limpar',\s+'40 3 \* \* \*'/);
    expect(M3).toMatch(/EXISTS \(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'\)/);
    expect(M3).toMatch(/EXCEPTION WHEN OTHERS THEN/);
  });

  it("o corpo de submeter respeita a lista branca do convite", () => {
    const corpo = semComentarios(
      corpoDaFuncao(migrationQueDefine("rpc_hr_convite_admissao_submeter"), "rpc_hr_convite_admissao_submeter"),
    );
    expect(corpo).not.toMatch(/retribuic/i);
    expect(corpo).not.toMatch(/vinculo/i);
    expect(corpo).not.toMatch(/membership/i);
    expect(corpo).not.toMatch(/permission/i);
    expect(corpo).not.toMatch(/pessoas_contas/i);
    expect(corpo).not.toMatch(/pessoas_sindicalizacao/);
  });

  it("submeter (o BIC, os anexos) e criar (os anexos) foram redefinidas depois, mas estado nao", () => {
    // submeter: a mais recente ja leva o BIC (HRA18); a de M3 e o ponto de partida.
    expect(corpoDaFuncao(migrationQueDefine("rpc_hr_convite_admissao_submeter"), "rpc_hr_convite_admissao_submeter")).toContain("HRA18");
    expect(corpoDaFuncao(M3, "rpc_hr_convite_admissao_submeter")).not.toContain("HRA18");
    // criar: a mais recente e a dos anexos (20261210070000), que parte da de M3 e so acrescenta a heranca dos ficheiros.
    expect(migrationQueDefine("rpc_hr_convite_admissao_criar")).toBe(migrationPorVersao("20261210070000"));
    expect(migrationQueDefine("rpc_hr_convite_admissao_estado")).toBe(M2);
  });

  it("o cabecalho avisa que precisa das Edge Functions novas", () => {
    expect(M3).toMatch(/PRECISA das Edge Functions convite-admissao e criar-acesso-pessoa/);
  });
});

// ---------------------------------------------------------------------------
// O que os hooks chamam tem de existir numa migration
// ---------------------------------------------------------------------------

const HOOKS = import.meta.glob("../../../hooks/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const HOOKS_DE_ADMISSAO = Object.entries(HOOKS).filter(([caminho]) =>
  /(Admissao|Convite|AcessoPessoa)/.test(caminho),
);

describe("os hooks de admissao so chamam RPCs que alguma migration cria", () => {
  const nomes = new Set<string>();
  for (const [, texto] of HOOKS_DE_ADMISSAO) {
    for (const m of texto.matchAll(/hrRpc\(\s*"([a-z0-9_]+)"/g)) nomes.add(m[1]);
  }

  it("encontrou os hooks e as chamadas (o teste nao e vazio)", () => {
    expect(HOOKS_DE_ADMISSAO.length).toBeGreaterThanOrEqual(5);
    expect(nomes.size).toBeGreaterThanOrEqual(6);
  });

  it.each([...nomes].map((n) => [n]))("%s tem CREATE FUNCTION numa migration", (nome) => {
    const existe = Object.values(MIGRATIONS).some((sql) => padraoDeCriacao(nome).test(sql));
    expect(existe, `nenhuma migration cria public.${nome}`).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Os motivos jsonb de estado e rascunho pertencem ao catalogo da Edge Function
// ---------------------------------------------------------------------------

describe("os motivos devolvidos em jsonb pertencem a CODIGOS_PUBLICOS", () => {
  function motivosJsonb(corpo: string): string[] {
    const semProsa = semComentarios(corpo);
    const literais = [...semProsa.matchAll(/'erro',\s*'([a-z_]+)'/g)].map((m) => m[1]);
    const atribuidos = [...semProsa.matchAll(/v_motivo\s*:=\s*'([a-z_]+)'/g)].map((m) => m[1]);
    return [...literais, ...atribuidos];
  }

  const publicos: readonly string[] = CODIGOS_PUBLICOS;

  it.each([
    ["rpc_hr_convite_admissao_estado"],
    ["rpc_hr_convite_admissao_rascunho"],
  ])("%s", (funcao) => {
    const motivos = motivosJsonb(corpoDaFuncao(migrationQueDefine(funcao), funcao));
    expect(motivos.length).toBeGreaterThan(0);
    for (const motivo of motivos) {
      expect(publicos, `${funcao} devolve '${motivo}', que a Edge Function nao conhece`).toContain(motivo);
    }
  });
});

// -----------------------------------------------------------------------------
// As RPCs de configuracao da admissao (20261210020000)
// -----------------------------------------------------------------------------

describe("migration 20261210020000 -- as RPCs de configuracao", () => {
  it("ler: gate de configuracao, criar ou ver pessoa; a forma e a que o hook espera", () => {
    const corpo = corpoDaFuncao(M2, "rpc_hr_admissao_configuracao_ler");
    expect(corpo).toMatch(/'hr\.admissao\.obrigatorios\.gerir'/);
    expect(corpo).toMatch(/'hr\.pessoas\.create'/);
    expect(corpo).toMatch(/'hr\.pessoas\.view'/);
    expect(corpo).toMatch(/ERRCODE = '42501'/);
    expect(corpo).toMatch(/CASE WHEN c\.origem = 'rh' THEN 'rh' ELSE c\.posicao END/);
    expect(M2).toMatch(/codigo\s+text,\s+origem\s+text,\s+condicional\s+boolean,\s+posicao\s+text,\s+configuravel\s+boolean/);
    expect(temComando(M2, "GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_configuracao_ler(uuid) TO authenticated;")).toBe(true);
    expect(temComando(M2, "REVOKE ALL ON FUNCTION public.rpc_hr_admissao_configuracao_ler(uuid) FROM anon;")).toBe(true);
  });

  it("definir_posicao: so quem gere a configuracao, so as tres posicoes, so campos de origem 'pessoa'", () => {
    const corpo = corpoDaFuncao(M2, "rpc_hr_admissao_definir_posicao");
    expect(corpo).toMatch(/'hr\.admissao\.obrigatorios\.gerir'/);
    expect(corpo).not.toMatch(/'hr\.pessoas\.(create|edit|view)'/);
    expect(corpo).toMatch(/p_posicao NOT IN \('convite', 'ficha', 'opcional'\)/);
    expect(corpo).toMatch(/RAISE EXCEPTION 'posicao_invalida' USING ERRCODE = '22023'/);
    expect(corpo).toMatch(/c\.codigo = p_codigo AND c\.origem = 'pessoa'/);
    expect(corpo).toMatch(/RAISE EXCEPTION 'codigo_nao_configuravel' USING ERRCODE = '22023'/);
    expect(corpo).toMatch(/updated_by\s+=\s+auth\.uid\(\)/);
    expect(temComando(M2, "REVOKE ALL ON FUNCTION public.rpc_hr_admissao_definir_posicao(uuid, text, text) FROM anon;")).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// A Edge Function convite-admissao e a base dizem o mesmo (accao "criar")
// -----------------------------------------------------------------------------

const EDGE_INDEX = Object.values(
  import.meta.glob("../../../../supabase/functions/convite-admissao/index.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
)[0];

describe("a Edge Function convite-admissao alinha com rpc_hr_convite_admissao_criar", () => {
  const edge = semComentarios(EDGE_INDEX);

  it("passa p_actor com o id de auth.users de quem chamou, e nao um anew_users.id", () => {
    expect(edge).toMatch(/p_actor:\s*authUidChamador/);
    expect(edge).not.toMatch(/p_actor_id/);
    expect(edge).not.toMatch(/from\("anew_users"\)/);
    // O mesmo uid que a Edge usa para verificar a permissao.
    expect(edge).toMatch(/_auth_uid:\s*authUidChamador/);
  });

  it("chama criar so com as cinco chaves que a assinatura da base tem", () => {
    const chamada = /rpc\("rpc_hr_convite_admissao_criar",\s*\{([^}]*)\}/.exec(edge);
    expect(chamada).not.toBeNull();
    const chaves = [...(chamada === null ? "" : chamada[1]).matchAll(/\b(p_[a-z_]+):/g)].map((m) => m[1]).sort();
    expect(chaves).toEqual(["p_actor", "p_email", "p_pessoa_id", "p_token_hash", "p_valid_until"]);
    const corpo = corpoDaFuncao(M3, "rpc_hr_convite_admissao_criar");
    expect(M3).toMatch(/p_pessoa_id\s+uuid,\s+p_token_hash\s+text,\s+p_valid_until\s+timestamptz,\s+p_email\s+text,\s+p_actor\s+uuid/);
    expect(corpo.length).toBeGreaterThan(0);
  });

  it("le o retorno (convite_id, rascunho_herdado) pela funcao pura e nao como um uuid solto", () => {
    expect(edge).toMatch(/lerResultadoCriar\(resultadoCriar\)/);
    expect(edge).not.toMatch(/data:\s*conviteId/);
  });

  it("so devolve o link por linkParaOCriador (rascunho herdado nunca o mostra)", () => {
    expect(edge).toMatch(/linkParaOCriador\(\{\s*emailEnviado,\s*rascunhoHerdado,/);
    // O link no corpo do e-mail e legitimo; o da resposta ao RH nunca sai de `emailEnviado ? null : ...`.
    expect(edge).not.toMatch(/link\s*=\s*emailEnviado\s*\?/);
    expect(edge).toMatch(/\blink,\s*\}\);/);
  });

  it("salta o registo do envio sem convite_id e trata o false do boolean", () => {
    expect(edge).toMatch(/if \(!conviteId\) \{[\s\S]*?\} else \{[\s\S]*?rpc_hr_convite_admissao_registar_envio/);
    expect(edge).toMatch(/const \{ data: registado, error: erroRegisto \}/);
    expect(edge).toMatch(/registado !== true/);
  });
});

// -----------------------------------------------------------------------------
// REGRA DE NEGOCIO: NIF e NISS ja existentes verificam-se SEMPRE por
// organizacao. O mesmo numero pode existir em pessoas de duas organizacoes (na
// vida real pode ser a mesma pessoa). O digito de controlo nao depende da
// organizacao.
// -----------------------------------------------------------------------------

describe("NIF e NISS: a unicidade e por organizacao", () => {
  const M_UNICIDADE = migrationPorVersao("20261130040000");

  it("os indices unicos de NIF e NISS tem a organizacao como primeira coluna", () => {
    expect(M_UNICIDADE).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_identificacao_nif_org\s+ON public\.pessoas_identificacao \(organization_id, nif\)\s+WHERE nif IS NOT NULL/,
    );
    expect(M_UNICIDADE).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_identificacao_niss_org\s+ON public\.pessoas_identificacao \(organization_id, niss\)\s+WHERE niss IS NOT NULL/,
    );
  });

  it("nenhum indice unico de NIF ou NISS nas migrations e global (sem organization_id)", () => {
    const indices = Object.values(MIGRATIONS)
      .map(semComentarios)
      .flatMap((sql) => [...sql.matchAll(/CREATE UNIQUE INDEX[^;]*ON public\.pessoas_identificacao\s*\(([^)]*)\)/g)])
      .map((m) => m[1])
      .filter((colunas) => /\b(nif|niss)\b/.test(colunas));
    // Nao e um teste vazio: os dois da migration 20261130040000 existem.
    expect(indices.length).toBeGreaterThanOrEqual(2);
    for (const colunas of indices) {
      expect(colunas, `indice unico sem organizacao em (${colunas})`).toMatch(/^\s*organization_id\s*,/);
    }
  });

  it("a procura de duplicados recebe a organizacao e filtra todos os ramos por ela", () => {
    const sql = migrationQueDefine("hr_pessoa_duplicados_candidatos");
    const corpo = semComentarios(corpoDaFuncao(sql, "hr_pessoa_duplicados_candidatos"));
    expect(sql).toMatch(/hr_pessoa_duplicados_candidatos\(\s*p_organization_id\s+uuid,\s*p_nif\s+text,\s*p_niss\s+text/);
    expect(corpo.match(/i\.organization_id = p_organization_id/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(corpo.match(/p\.organization_id = p_organization_id/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("submeter procura duplicados com a organizacao do CONVITE, lida do proprio convite", () => {
    const corpo = semComentarios(
      corpoDaFuncao(migrationQueDefine("rpc_hr_convite_admissao_submeter"), "rpc_hr_convite_admissao_submeter"),
    );
    // v_org vem do UPDATE ... RETURNING do convite consumido, nunca do pedido.
    expect(corpo).toMatch(/RETURNING (?:id, )?pessoa_id, organization_id INTO (?:v_convite_id, )?v_pessoa_id, v_org/);
    expect(corpo).toMatch(/hr_pessoa_duplicados_candidatos\(\s*v_org,\s*v_dup_nif,\s*v_dup_niss/);
    expect(corpo).not.toMatch(/p_dados\s*(?:->>|\?)\s*'organization_id'/);
    // O proprio pessoa fica de fora (so conflitam OUTRAS fichas).
    expect(corpo).toMatch(/v_dup_nome1, v_dup_apelido, v_dup_nascim, v_pessoa_id/);
  });

  it("registar_recusa so aceita pessoa_id da mesma organizacao do convite", () => {
    const corpo = semComentarios(
      corpoDaFuncao(migrationQueDefine("rpc_hr_convite_admissao_registar_recusa"), "rpc_hr_convite_admissao_registar_recusa"),
    );
    expect(corpo).toMatch(/SELECT c\.id, c\.organization_id INTO v_convite/);
    expect(corpo).toMatch(
      /WHERE p\.id = ANY \(coalesce\(p_conflito_pessoa_ids, ARRAY\[\]::uuid\[\]\)\)\s+AND p\.organization_id = v_convite\.organization_id/,
    );
  });

  it("as RPCs do RH tambem so devolvem fichas da organizacao da pessoa", () => {
    const corpo = semComentarios(corpoDaFuncao(M3, "rpc_hr_convite_admissao_conflitos"));
    expect(corpo).toMatch(/AND pc\.organization_id = v_org/);
    expect(corpo).toMatch(/AND cc\.organization_id = v_org/);
  });

  it("o digito de controlo nao recebe organizacao: depende so do numero", () => {
    for (const nome of ["hr_nif_valido", "hr_niss_valido"]) {
      const assinatura = new RegExp("FUNCTION public\\." + nome + "\\(([^)]*)\\)").exec(M1);
      expect(assinatura, nome).not.toBeNull();
      const argumentos = assinatura === null ? "" : assinatura[1].trim();
      // Um unico argumento, o numero, em texto.
      expect(argumentos, nome).toMatch(/^p_[a-z]+ text$/);
      const corpo = semComentarios(corpoDaFuncao(M1, nome));
      expect(corpo, nome).not.toMatch(/organization|pessoas|auth\.uid/);
    }
    expect(M1).toMatch(/CREATE OR REPLACE FUNCTION public\.hr_nif_valido\(p_nif text\)/);
    expect(M1).toMatch(/CREATE OR REPLACE FUNCTION public\.hr_niss_valido\(p_niss text\)/);
  });
});
