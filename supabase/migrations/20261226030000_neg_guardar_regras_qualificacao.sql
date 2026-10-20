-- ============================================================
-- 20261226030000_neg_guardar_regras_qualificacao
-- ============================================================
-- O que faz: funções NOVAS para o separador «Qualificação» do botão Workflow
--   da página Pessoas (desenho: vault ficheiros/crm
--   ligacao-ui-workflow-pessoas-desenho.md, secções 3.4, 7 e 8.1; e
--   pessoas-ng019-e-permissao-workflow-desenho.md, secções 2.7 e 2.8):
--     neg_guardar_regras_qualificacao(p_organization_id, p_mql_when, p_sql_when)
--       grava as regras MQL e SQL da organização em lead_qualification_rules
--       (a mesma tabela que o separador de Leads escreve, uma linha por
--       organização) e devolve {antes, depois, mudou};
--     fn_neg_regra_qualificacao(p_regra)
--       auxiliar pura: valida uma regra e devolve-a na forma canónica.
-- Porquê uma função: em Leads o separador grava por upsert directo e as
--   políticas da tabela deixam escrever a qualquer membro da organização
--   (risco assumido; as políticas são partilhadas com a Mudelar e NÃO se
--   alteram aqui). Em Pessoas a escrita passa só por esta função, com a
--   verificação lá dentro, como neg_guardar_momento_ganho está desenhado.
-- Guardas, por esta ordem, todas ANTES de qualquer escrita:
--   1. valores (NG009): organização presente; cada regra NULL, jsonb null ou
--      um objecto só com as chaves all/any, cada uma uma lista de até 50
--      condições; cada condição um objecto {type} ou, para qualification_is,
--      {type, value} com value 'mql' ou 'sql'; nenhuma outra chave; tipos só
--      os 12 que o separador «Qualificação» de Leads grava hoje
--      (QUALIFICATION_LEGACY_KEYS de conditionCatalog.ts: 11 tipos, com
--      qualification_is desdobrado em mql/sql), todos conhecidos por
--      evaluate_condition. Strings soltas (o formato legado) são recusadas.
--      Tamanho total das duas regras até 32 KB.
--   2. sessão (42501);
--   3. organização do utilizador (get_user_crm_org_ids), com pessoas.view
--      nessa organização e com linha em negocio_workflow_config (NG008, a
--      mesma mensagem nos três casos, como neg_procurar_duplicados: quem não
--      é da organização não fica a saber se ela tem Pessoas). A Mudelar não
--      tem linha: recebe sempre NG008 e nada é lido nem escrito nos dados dela;
--   4. pessoas.config nesta organização (fn_neg_tem_permissao_org, 42501).
-- Escrita: bloqueio consultivo por organização e linha lida FOR UPDATE; se o
--   pedido for igual ao gravado (ou não houver linha e as duas regras vierem
--   vazias) devolve mudou:false sem escrever. Senão UPDATE da linha da
--   organização do pedido (já validada) ou INSERT ... ON CONFLICT
--   (organization_id). Só toca em mql_when, sql_when, created_by e
--   updated_by (anew_users.id de quem chama); updated_at e a auditoria
--   (fn_generic_entity_audit) ficam com os triggers que a tabela já tem.
--   Nunca escreve noutra organização, nunca escreve em negocio_workflow_config,
--   e não cria regras por omissão: sem regras, sem selo.
-- Forma gravada: a de fn_normalize_lead_rule (20261204040000):
--   {"all": [...], "any": [...]}, duplicados exactos removidos, e NULL quando
--   não sobra nenhuma condição. É a forma que o editor de Leads já grava.
-- SECURITY DEFINER, e porquê: a função corre como postgres (dono da tabela,
--   sem FORCE RLS), por isso as guardas acima são a ÚNICA fronteira e estão
--   todas explícitas. search_path fixo; EXECUTE só para authenticated.
--   VOLATILE (escreve). Sem limite de pedidos (só as procuras de Pessoas o
--   levam).
-- Efeito hoje: na base, só lead_qualification_overlay_v2 lê esta tabela, e só
--   com sequential_flow ligado; a nike não tem linha em lead_pipeline_settings
--   (lido a 20/10), por isso gravar não muda nenhuma lead da nike. O selo
--   MQL/SQL em Pessoas precisa da função neg_ de avaliação (outra migration).
--   Não há trigger que marque leads para reavaliar ao mudar estas regras.
-- DEPENDE DE: a permissão pessoas.config em anew_permissions (migration da
--   permissão, de outro agente). Sem ela esta migration recusa aplicar.
-- POR DECIDIR (D3 a): que condições entram no catálogo de Pessoas. Esta função
--   aceita as 12 do separador de Leads. Se D3 tirar condições (por exemplo
--   «Qualificação = MQL/SQL», circular em Pessoas) ou criar tipos novos, a
--   lista c_tipos muda numa migration seguinte.
-- A UI precisa de: useRegrasQualificacao a gravar por esta função (via
--   chamarNeg.ts) em vez do upsert directo; traduzir NG008, NG009 e 42501;
--   regenerar os tipos do Supabase. A leitura continua pela tabela (política
--   de SELECT existente), como em Leads.
-- O separador de Leads continua a gravar por upsert directo: não muda.
-- Reversão: fora da pasta das migrations.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição: as peças de que depende são as lidas no remoto a 20/10.
DO $pre$
DECLARE
  v_txt text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid = p.pronamespace
             WHERE s.nspname = 'public'
               AND p.proname IN ('neg_guardar_regras_qualificacao', 'fn_neg_regra_qualificacao')) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: neg_guardar_regras_qualificacao ou fn_neg_regra_qualificacao já existe; nada feito.';
  END IF;

  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_exigir_config(uuid)',            '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_tem_permissao_org(uuid,text)',   '05943a6cfb0382a07322870262170c8d'),
              ('public.fn_neg_actor()',                        '01c906dd40875e72a5e63bdc10200359'),
              ('public.crm_scope_keys(text)',                  '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',        '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',            '29782031244dd3b0842ca43b271e2bf1'),
              ('public.fn_normalize_lead_rule(jsonb)',         '43bf9707d3cd44434c3280273f889def'),
              ('public.evaluate_condition(jsonb,jsonb,text)',  'b817b9fd45d153c936d98399f1988b77')
            ) AS e(sig, h)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL
               OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 20/10: %; nada feito.', v_txt;
  END IF;

  -- A tabela: colunas, chave por organização (para o ON CONFLICT), dono
  -- postgres (o dono da função), RLS sem FORCE, e só os dois triggers lidos.
  IF (SELECT count(*) FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'lead_qualification_rules'
        AND c.column_name IN ('organization_id', 'mql_when', 'sql_when', 'created_at',
                              'updated_at', 'created_by', 'updated_by')) <> 7 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: lead_qualification_rules sem as colunas esperadas; nada feito.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k
                 WHERE k.conrelid = 'public.lead_qualification_rules'::regclass
                   AND k.contype::text = 'p'
                   AND pg_catalog.pg_get_constraintdef(k.oid) = 'PRIMARY KEY (organization_id)') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: lead_qualification_rules sem chave primária por organização; nada feito.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
                 WHERE c.oid = 'public.lead_qualification_rules'::regclass
                   AND pg_catalog.pg_get_userbyid(c.relowner)::text = 'postgres'
                   AND c.relrowsecurity AND NOT c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: lead_qualification_rules mudou de dono ou de RLS; nada feito.';
  END IF;
  IF (SELECT string_agg(t.tgname::text, ',' ORDER BY t.tgname::text)
      FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.lead_qualification_rules'::regclass AND NOT t.tgisinternal)
     IS DISTINCT FROM 'trg_audit_lead_qualification_rules,update_lead_qualification_rules_updated_at' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: lead_qualification_rules tem triggers diferentes dos de 20/10; nada feito.';
  END IF;

  IF pg_catalog.to_regclass('public.negocio_workflow_config') IS NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta negocio_workflow_config; nada feito.';
  END IF;

  -- A permissão própria tem de existir antes (migration da permissão).
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = 'pessoas.config') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta a permissão pessoas.config (aplicar antes a migration da permissão); nada feito.';
  END IF;
END
$pre$;

-- Auxiliar pura: valida uma regra (NG009) e devolve-a na forma canónica.
CREATE FUNCTION public.fn_neg_regra_qualificacao(p_regra jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  -- Os tipos que o separador «Qualificação» de Leads grava hoje
  -- (QUALIFICATION_LEGACY_KEYS), todos no CASE de evaluate_condition.
  c_tipos CONSTANT text[] := ARRAY[
    'has_assignee', 'has_source', 'has_contact_logged', 'has_scheduled_visit',
    'has_active_deal', 'has_active_quote', 'has_active_proposal',
    'has_signed_contract', 'qualification_is', 'last_contact_is_negative',
    'last_contact_is_positive'];
  c_max_condicoes CONSTANT integer := 50;
  v_chave text;
  v_elem  jsonb;
BEGIN
  IF p_regra IS NULL OR jsonb_typeof(p_regra) = 'null' THEN
    RETURN NULL;
  END IF;

  -- Duas verificações separadas: jsonb_object_keys sobre um escalar dá erro,
  -- e um OR não garante a ordem de avaliação.
  IF jsonb_typeof(p_regra) <> 'object' THEN
    RAISE EXCEPTION 'Regra de qualificação inválida.' USING ERRCODE = 'NG009';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_regra) AS k(chave)
             WHERE k.chave NOT IN ('all', 'any')) THEN
    RAISE EXCEPTION 'Regra de qualificação inválida.' USING ERRCODE = 'NG009';
  END IF;

  FOREACH v_chave IN ARRAY ARRAY['all', 'any']
  LOOP
    CONTINUE WHEN NOT (p_regra ? v_chave);

    IF jsonb_typeof(p_regra -> v_chave) <> 'array'
       OR jsonb_array_length(p_regra -> v_chave) > c_max_condicoes THEN
      RAISE EXCEPTION 'Regra de qualificação inválida.' USING ERRCODE = 'NG009';
    END IF;

    FOR v_elem IN SELECT e.elem FROM jsonb_array_elements(p_regra -> v_chave) AS e(elem)
    LOOP
      IF jsonb_typeof(v_elem) <> 'object' THEN
        RAISE EXCEPTION 'Regra de qualificação inválida.' USING ERRCODE = 'NG009';
      END IF;
      IF jsonb_typeof(v_elem -> 'type') IS DISTINCT FROM 'string'
         OR NOT ((v_elem ->> 'type') = ANY (c_tipos))
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_elem) AS k(chave)
                    WHERE k.chave NOT IN ('type', 'value'))
         OR ((v_elem ->> 'type') = 'qualification_is'
             AND (jsonb_typeof(v_elem -> 'value') IS DISTINCT FROM 'string'
                  OR NOT ((v_elem ->> 'value') IN ('mql', 'sql'))))
         OR ((v_elem ->> 'type') <> 'qualification_is' AND v_elem ? 'value') THEN
        RAISE EXCEPTION 'Regra de qualificação inválida.' USING ERRCODE = 'NG009';
      END IF;
    END LOOP;
  END LOOP;

  -- Só objectos válidos chegam aqui: a normalização apenas remove duplicados,
  -- põe as duas chaves e devolve NULL quando não sobra nenhuma condição.
  RETURN public.fn_normalize_lead_rule(p_regra);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_regra_qualificacao(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.fn_neg_regra_qualificacao(jsonb) IS
  'Pessoas, Workflow, Qualificação: valida uma regra MQL/SQL (só objectos {type} dos 12 tipos do separador de Leads; qualification_is com value mql/sql; até 50 por lista) e devolve a forma de fn_normalize_lead_rule. NG009 se inválida. Uso interno de neg_guardar_regras_qualificacao. 20261226030000.';

CREATE FUNCTION public.neg_guardar_regras_qualificacao(
  p_organization_id uuid,
  p_mql_when jsonb,
  p_sql_when jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  c_max_bytes CONSTANT integer := 32768;
  v_uid       uuid := auth.uid();
  v_mql       jsonb;
  v_sql       jsonb;
  v_keys_pes  text[];
  v_existe    boolean;
  v_antes_mql jsonb;
  v_antes_sql jsonb;
  v_actor     uuid;
BEGIN
  -- 1. Valores
  IF p_organization_id IS NULL
     OR COALESCE(octet_length(p_mql_when::text), 0)
        + COALESCE(octet_length(p_sql_when::text), 0) > c_max_bytes THEN
    RAISE EXCEPTION 'Regra de qualificação inválida.' USING ERRCODE = 'NG009';
  END IF;
  v_mql := public.fn_neg_regra_qualificacao(p_mql_when);
  v_sql := public.fn_neg_regra_qualificacao(p_sql_when);

  -- 2. Sessão
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Organização do utilizador, com pessoas.view e com configuração.
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':')) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 4. Permissão própria do Workflow de Pessoas, nesta organização.
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.config') THEN
    RAISE EXCEPTION 'Sem permissão para configurar o workflow de Pessoas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5. Linha da organização, em exclusivo até ao fim da transacção.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('neg_guardar_regras_qualificacao:' || p_organization_id::text, 0));

  SELECT r.mql_when, r.sql_when
    INTO v_antes_mql, v_antes_sql
  FROM public.lead_qualification_rules r
  WHERE r.organization_id = p_organization_id
  FOR UPDATE;
  v_existe := FOUND;

  IF (NOT v_existe AND v_mql IS NULL AND v_sql IS NULL)
     OR (v_existe
         AND v_antes_mql IS NOT DISTINCT FROM v_mql
         AND v_antes_sql IS NOT DISTINCT FROM v_sql) THEN
    RETURN jsonb_build_object(
      'antes',  jsonb_build_object('mql_when', v_antes_mql, 'sql_when', v_antes_sql),
      'depois', jsonb_build_object('mql_when', v_antes_mql, 'sql_when', v_antes_sql),
      'mudou',  false);
  END IF;

  -- 6. Escrita, só na linha da organização validada acima.
  v_actor := public.fn_neg_actor();

  IF v_existe THEN
    UPDATE public.lead_qualification_rules r
    SET mql_when   = v_mql,
        sql_when   = v_sql,
        updated_by = v_actor
    WHERE r.organization_id = p_organization_id;
  ELSE
    INSERT INTO public.lead_qualification_rules AS r
      (organization_id, mql_when, sql_when, created_by, updated_by)
    VALUES (p_organization_id, v_mql, v_sql, v_actor, v_actor)
    ON CONFLICT (organization_id) DO UPDATE
      SET mql_when   = EXCLUDED.mql_when,
          sql_when   = EXCLUDED.sql_when,
          updated_by = EXCLUDED.updated_by;
  END IF;

  RETURN jsonb_build_object(
    'antes',  jsonb_build_object('mql_when', v_antes_mql, 'sql_when', v_antes_sql),
    'depois', jsonb_build_object('mql_when', v_mql, 'sql_when', v_sql),
    'mudou',  true);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_guardar_regras_qualificacao(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_guardar_regras_qualificacao(uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.neg_guardar_regras_qualificacao(uuid, jsonb, jsonb) IS
  'Pessoas, Workflow, Qualificação: grava as regras MQL/SQL da organização em lead_qualification_rules (só a linha dessa organização) e devolve {antes, depois, mudou}. Regra inválida NG009; sem sessão 42501; organização sem Pessoas ou sem pessoas.view NG008; sem pessoas.config 42501. Nunca cria regras por omissão. 20261226030000.';

-- CONFERIR
DO $conferir$
DECLARE
  v_oid  oid := pg_catalog.to_regprocedure('public.neg_guardar_regras_qualificacao(uuid,jsonb,jsonb)');
  v_aux  oid := pg_catalog.to_regprocedure('public.fn_neg_regra_qualificacao(jsonb)');
  v_casos text[] := ARRAY[
    '"has_source"',
    '[]',
    '{"all": [], "other": []}',
    '{"all": {"type": "has_source"}}',
    '{"all": ["has_source"]}',
    '{"all": [{"type": "has_deal_won"}]}',
    '{"all": [{"type": "has_source", "value": 1}]}',
    '{"all": [{"type": "has_source", "extra": true}]}',
    '{"any": [{"type": "qualification_is"}]}',
    '{"any": [{"type": "qualification_is", "value": "xyz"}]}',
    '{"any": [{"type": 7}]}'];
  v_caso text;
BEGIN
  IF v_oid IS NULL OR v_aux IS NULL THEN
    RAISE EXCEPTION 'CONFERIR: as funções não foram criadas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                 WHERE p.oid = v_oid AND p.prosecdef AND p.provolatile::text = 'v'
                   AND pg_catalog.pg_get_userbyid(p.proowner)::text = 'postgres'
                   AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]) THEN
    RAISE EXCEPTION 'CONFERIR: neg_guardar_regras_qualificacao sem DEFINER, VOLATILE, dono postgres ou search_path fixo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                 WHERE p.oid = v_aux AND NOT p.prosecdef AND p.provolatile::text = 'i'
                   AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]) THEN
    RAISE EXCEPTION 'CONFERIR: fn_neg_regra_qualificacao sem INVOKER, IMMUTABLE ou search_path fixo';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) a
             WHERE p.oid IN (v_oid, v_aux) AND a.grantee = 0)
     OR pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_aux, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_aux, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_aux, 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: privilégios a mais nas funções novas';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: neg_guardar_regras_qualificacao sem EXECUTE para authenticated';
  END IF;

  -- Os 11 tipos aceites continuam no CASE de evaluate_condition.
  IF EXISTS (SELECT 1
             FROM unnest(ARRAY['has_assignee', 'has_source', 'has_contact_logged',
                               'has_scheduled_visit', 'has_active_deal', 'has_active_quote',
                               'has_active_proposal', 'has_signed_contract', 'qualification_is',
                               'last_contact_is_negative', 'last_contact_is_positive']) AS t(tipo)
             WHERE position(E'\n    WHEN ''' || t.tipo || '''' IN
                            pg_catalog.pg_get_functiondef('public.evaluate_condition(jsonb,jsonb,text)'::regprocedure)) = 0) THEN
    RAISE EXCEPTION 'CONFERIR: há tipos aceites que evaluate_condition não avalia';
  END IF;

  -- A auxiliar: forma canónica, vazios a NULL, duplicados fora.
  IF public.fn_neg_regra_qualificacao(NULL) IS NOT NULL
     OR public.fn_neg_regra_qualificacao('null'::jsonb) IS NOT NULL
     OR public.fn_neg_regra_qualificacao('{}'::jsonb) IS NOT NULL
     OR public.fn_neg_regra_qualificacao('{"all": [], "any": []}'::jsonb) IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: uma regra vazia devia ficar NULL';
  END IF;
  IF public.fn_neg_regra_qualificacao(
       '{"all": [{"type": "has_source"}, {"type": "has_source"}], "any": [{"type": "qualification_is", "value": "sql"}]}'::jsonb)
     IS DISTINCT FROM
     '{"all": [{"type": "has_source"}], "any": [{"type": "qualification_is", "value": "sql"}]}'::jsonb THEN
    RAISE EXCEPTION 'CONFERIR: a forma canónica não é a esperada';
  END IF;
  IF public.fn_neg_regra_qualificacao('{"any": [{"type": "has_active_quote"}]}'::jsonb)
     IS DISTINCT FROM '{"all": [], "any": [{"type": "has_active_quote"}]}'::jsonb THEN
    RAISE EXCEPTION 'CONFERIR: a lista em falta devia ficar vazia';
  END IF;

  -- A auxiliar: cada forma inválida dá NG009.
  FOREACH v_caso IN ARRAY v_casos
  LOOP
    BEGIN
      PERFORM public.fn_neg_regra_qualificacao(v_caso::jsonb);
      RAISE EXCEPTION 'CONFERIR: a regra inválida % passou', v_caso;
    EXCEPTION WHEN SQLSTATE 'NG009' THEN
      NULL;
    END;
  END LOOP;

  -- Sem sessão de utilizador (esta migration) recusa antes de ler ou escrever.
  BEGIN
    PERFORM public.neg_guardar_regras_qualificacao(
      'b6ffce4f-f630-4933-833a-008649757a33'::uuid, NULL, NULL);
    RAISE EXCEPTION 'CONFERIR: sem sessão, neg_guardar_regras_qualificacao não recusou';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- Valor inválido recusa antes de tudo, mesmo sem sessão.
  BEGIN
    PERFORM public.neg_guardar_regras_qualificacao(
      'b6ffce4f-f630-4933-833a-008649757a33'::uuid, '{"all": ["has_source"]}'::jsonb, NULL);
    RAISE EXCEPTION 'CONFERIR: regra inválida não deu NG009';
  EXCEPTION WHEN SQLSTATE 'NG009' THEN
    NULL;
  END;

  -- As políticas da tabela não mudaram (continuam as quatro de 20261110490000).
  IF (SELECT count(*) FROM pg_catalog.pg_policy po
      WHERE po.polrelid = 'public.lead_qualification_rules'::regclass) <> 4 THEN
    RAISE EXCEPTION 'CONFERIR: as políticas de lead_qualification_rules mudaram';
  END IF;
END
$conferir$;

COMMIT;
