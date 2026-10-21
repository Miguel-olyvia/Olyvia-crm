-- ============================================================
-- 20261226240000_neg_guardar_recusa_orcamento
-- ============================================================
-- QUANDO E POR QUE ORDEM SE APLICA
--   SÓ DEPOIS DE 20261226210000 (que cria a coluna
--   negocio_workflow_config.recusa_orcamento). A pré-condição verifica-o e,
--   sem ela, aborta sem fazer nada. A 210000 só se aplica entre as 20h00 e
--   as 7h59 de Lisboa (bloqueia quotes, partilhada com a Mudelar); o db push
--   aplica por ordem e pára na primeira que falha, por isso num push de dia
--   esta fica pendente, sem efeito.
--   Esta migration só toca em coisas NOSSAS (uma função nova, que escreve
--   só em negocio_workflow_config): não precisa de janela própria nem bloqueia
--   tabelas. Independente de 20261226220000 e de 20261226230000.
--
-- Porquê: a 210000 criou a escolha «orçamento recusado» (perder_se_ultimo,
--   a omissão, ou manter_aberto) sem forma de a gravar: neg_guardar_config_
--   negocios não a grava, e mudar-lhe a assinatura (um 7.º argumento) criaria
--   uma segunda versão e o PostgREST deixava de saber qual chamar. Esta
--   função nova grava só essa escolha; neg_guardar_config_negocios NÃO muda.
--
-- O que faz
--   neg_guardar_recusa_orcamento(p_organization_id uuid, p_valor text)
--     -> jsonb, NOVA. SECURITY DEFINER, search_path fixo, EXECUTE só para
--     authenticated. As mesmas regras de neg_guardar_config_negocios (versão
--     lida no remoto a 21/10, md5 39b53c656e2ba226ff82e2b9bc360dfb):
--       1. p_organization_id obrigatório e p_valor em ('perder_se_ultimo',
--          'manter_aberto'): senão NG009;
--       2. sessão com utilizador: senão 42501;
--       3. a organização tem de ser uma das organizações CRM de quem chama,
--          com pessoas.view e chave de âmbito nessa organização: senão NG008
--          (nunca se escreve numa organização só porque veio no parâmetro);
--       4. pessoas.config com chave de âmbito nessa organização
--          (fn_neg_tem_permissao_org): senão 42501;
--       5. o mesmo bloqueio consultivo de neg_guardar_config_negocios
--          (por organização): as duas gravações da configuração não se
--          cruzam;
--       6. a linha de negocio_workflow_config da organização, FOR UPDATE;
--          sem ela, NG008 (nunca INSERT).
--     Grava só recusa_orcamento. Com o mesmo valor não escreve nada.
--     Devolve {antes: {recusa_orcamento}, depois: {recusa_orcamento}, mudou}.
--     A auditoria é a do gatilho genérico de negocio_workflow_config
--     (trg_audit_negocio_workflow_config); updated_by e updated_at pelos
--     gatilhos da tabela.
--
-- Desempenho: uma leitura de chaves de âmbito, uma linha pela chave da
--   organização e, quando muda, um UPDATE dessa linha. Nenhuma leitura de
--   catálogo na função. Não está em nenhum caminho quente (só o ecrã de
--   configuração a chama).
--   Provado na nike a 21/10, em transacções revertidas (BEGIN, coluna da
--   210000 simulada, erro forçado no fim): sem a 210000 a pré-condição
--   recusa; com ela a migration inteira e o CONFERIR passam; com pessoas.config
--   grava manter_aberto (mudou true, updated_by pelo gatilho), repetir dá
--   mudou false, voltar a perder_se_ultimo dá mudou true; valor inválido ou
--   organização nula NG009; organização que não é de quem chama NG008; sem
--   pessoas.config 42501; sem sessão 42501; anon sem EXECUTE.
--
-- Notas da revisão de 21/10
--   - neg_guardar_config_negocios chama fn_neg_exigir_config(p_organization_id);
--     esta não. Lida no remoto a 21/10: fn_neg_exigir_config só lê
--     negocio_workflow_config e dá NG008 se a linha não existe, nada mais.
--     O passo 6 (a linha, FOR UPDATE, NG008 sem ela) cobre exactamente isso:
--     há paridade, e a mesma mensagem.
--   - NG008 significa aqui «sem a página Pessoas activa», o mesmo que nas
--     outras funções; uma organização sem linha de configuração e uma sem a
--     página Pessoas são, para esta tabela, a mesma coisa.
--   - O md5 das colunas de negocio_workflow_config (4d3770fb...) assume a
--     ordem e o tipo que a 210000 deixa. Recalcular no remoto logo depois de a
--     210000 estar aplicada e ANTES de empurrar esta: se divergir, a
--     pré-condição recusa-se (falha fechado, sem efeito).
--
-- Impacto na Mudelar: nenhum. A Mudelar não tem linha em
--   negocio_workflow_config (NG008 se alguém tentasse); nenhuma tabela,
--   política ou função que ela use é tocada.
--
-- O que o ecrã tem de fazer junto (não parte nada sem isto)
--   - Configuração de Pessoas: o controlo da recusa de orçamento, que lê
--     negocio_workflow_config.recusa_orcamento e grava por
--     neg_guardar_recusa_orcamento(organização activa, valor), em pt e en:
--       pt «Orçamento recusado: perder o negócio se era o último documento
--           em aberto» / «Manter o negócio aberto»
--       en «Quote declined: lose the deal if it was the last open document»
--           / «Keep the deal open»
--   - Traduzir NG008, NG009 e 42501 (já traduzidos).
--   - Regenerar os tipos do Supabase.
--
-- Pré-condição: a 210000 está aplicada (a coluna, a sua omissão e o seu
--   CHECK, e o conjunto de colunas de negocio_workflow_config igual ao que a
--   210000 deixa); as funções de que esta depende iguais às de 21/10; a
--   função nova não existe.
-- CONFERIR: sem bloco DO. A lista de falhas, se não estiver vazia, é
--   convertida em integer: falha com a lista na mensagem e aborta.
-- Reversão: fora da pasta das migrations
--   (reversoes/R_20261226240000_neg_guardar_recusa_orcamento.sql).
--   Reverte-se ANTES de reverter a 210000 (que larga a coluna que esta função
--   escreve; a função ficaria a falhar em cada chamada).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição
SELECT CASE WHEN f.falhas IS NULL THEN 'PRE-CONDICAO: ok'
            ELSE ('PRE-CONDICAO falhou, nada feito: ' || f.falhas)::integer::text END AS pre_condicao
FROM (SELECT string_agg(u.motivo, '; ' ORDER BY u.motivo) AS falhas
      FROM (SELECT e.motivo FROM (VALUES
        -- A 210000 aplicada: a coluna, a omissão e o CHECK.
        (CASE WHEN NOT EXISTS (
                SELECT 1 FROM pg_catalog.pg_attribute a
                JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                WHERE a.attrelid = 'public.negocio_workflow_config'::regclass
                  AND a.attname::text = 'recusa_orcamento' AND a.attnum > 0 AND NOT a.attisdropped
                  AND a.attnotnull
                  AND pg_catalog.format_type(a.atttypid, a.atttypmod) = 'text'
                  AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) = '''perder_se_ultimo''::text')
              THEN 'a 20261226210000 não está aplicada (falta negocio_workflow_config.recusa_orcamento)' END),
        (CASE WHEN NOT EXISTS (
                SELECT 1 FROM pg_catalog.pg_constraint c
                WHERE c.conrelid = 'public.negocio_workflow_config'::regclass
                  AND c.conname::text = 'negocio_workflow_config_recusa_orcamento_check'
                  AND c.contype::text = 'c' AND c.convalidated
                  AND pg_catalog.pg_get_constraintdef(c.oid)
                      = 'CHECK ((recusa_orcamento = ANY (ARRAY[''perder_se_ultimo''::text, ''manter_aberto''::text])))')
              THEN 'falta o CHECK negocio_workflow_config_recusa_orcamento_check da 20261226210000' END),
        -- As colunas da tabela: as de 21/10 mais recusa_orcamento, e nada mais.
        (CASE WHEN (SELECT md5(string_agg(a.attname::text || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod), ','
                                         ORDER BY a.attnum))
                    FROM pg_catalog.pg_attribute a
                    WHERE a.attrelid = 'public.negocio_workflow_config'::regclass AND a.attnum > 0 AND NOT a.attisdropped)
                   IS DISTINCT FROM '4d3770fb7b526a1dfbd7a07bdf9a5962'
              THEN 'as colunas de negocio_workflow_config não são as que a 20261226210000 deixa' END),
        (CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                           WHERE p.pronamespace = 'public'::regnamespace
                             AND p.proname::text = 'neg_guardar_recusa_orcamento')
              THEN 'neg_guardar_recusa_orcamento já existe' END)
      ) AS e(motivo)
      UNION ALL
      -- As funções de que esta depende, e a que lhe serve de modelo, iguais às de 21/10.
      SELECT e2.sig || ' mudou desde 21/10 ou falta'
      FROM (VALUES
        ('public.neg_guardar_config_negocios(uuid,text,text,text,text,integer)', '39b53c656e2ba226ff82e2b9bc360dfb'),
        ('public.fn_neg_tem_permissao_org(uuid,text)', '05943a6cfb0382a07322870262170c8d'),
        ('public.get_user_crm_org_ids(uuid)', '29782031244dd3b0842ca43b271e2bf1'),
        ('public.crm_scope_keys(text)', '6abb12e1d7a3db943630e8f8d7e15ca8'),
        ('public.has_anew_permission(uuid,text)', '8f69ed134c7d20e080d8c5a4161a3151')
      ) AS e2(sig, h)
      WHERE pg_catalog.to_regprocedure(e2.sig) IS NULL
         OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(e2.sig))) IS DISTINCT FROM e2.h) AS u) AS f;

CREATE FUNCTION public.neg_guardar_recusa_orcamento(p_organization_id uuid, p_valor text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_keys_pes text[];
  v_antes    text;
BEGIN
  -- 1. Valores
  IF p_organization_id IS NULL
     OR p_valor IS NULL OR p_valor NOT IN ('perder_se_ultimo', 'manter_aberto') THEN
    RAISE EXCEPTION 'Configuração de negócios inválida.' USING ERRCODE = 'NG009';
  END IF;

  -- 2. Sessão
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Organização do utilizador, com pessoas.view nessa organização.
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':')) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  -- 4. Permissão própria do Workflow de Pessoas, nesta organização.
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.config') THEN
    RAISE EXCEPTION 'Sem permissão para configurar o workflow de Pessoas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5. A mesma chave de neg_guardar_config_negocios: as duas não se cruzam.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('neg_guardar_config_negocios:' || p_organization_id::text, 0));

  -- 6. A linha da organização, em exclusivo até ao fim da transacção.
  SELECT c.recusa_orcamento INTO v_antes
  FROM public.negocio_workflow_config c
  WHERE c.organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  IF v_antes = p_valor THEN
    RETURN jsonb_build_object('antes', jsonb_build_object('recusa_orcamento', v_antes),
                              'depois', jsonb_build_object('recusa_orcamento', v_antes),
                              'mudou', false);
  END IF;

  -- 7. Escrita, só na linha da organização validada acima (nunca INSERT).
  UPDATE public.negocio_workflow_config c
  SET recusa_orcamento = p_valor
  WHERE c.organization_id = p_organization_id;

  RETURN jsonb_build_object('antes', jsonb_build_object('recusa_orcamento', v_antes),
                            'depois', jsonb_build_object('recusa_orcamento', p_valor),
                            'mudou', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_guardar_recusa_orcamento(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_guardar_recusa_orcamento(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.neg_guardar_recusa_orcamento(uuid, text) IS
  'Pessoas: grava só negocio_workflow_config.recusa_orcamento (perder_se_ultimo ou manter_aberto) da organização de quem chama, com pessoas.view e pessoas.config nessa organização; as mesmas regras e o mesmo bloqueio de neg_guardar_config_negocios, que não muda. NG008, NG009, 42501. 20261226240000.';

-- ============================================================
-- CONFERIR (sem DO: a lista de falhas convertida em integer aborta a transacção)
-- ============================================================
SELECT CASE WHEN f.falhas IS NULL THEN 'CONFERIR: ok'
            ELSE ('CONFERIR falhou: ' || f.falhas)::integer::text END AS conferir
FROM (SELECT string_agg(e.motivo, '; ' ORDER BY e.motivo) AS falhas
      FROM (VALUES
        (CASE WHEN NOT EXISTS (
                SELECT 1 FROM pg_catalog.pg_proc p
                WHERE p.oid = pg_catalog.to_regprocedure('public.neg_guardar_recusa_orcamento(uuid,text)')
                  AND p.prosecdef AND p.provolatile::text = 'v'
                  AND pg_catalog.pg_get_userbyid(p.proowner)::text = 'postgres'
                  AND array_to_string(p.proconfig, ',') = 'search_path=public, pg_temp'
                  AND p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}'
                  AND md5(replace(p.prosrc, chr(13), '')) = '95892b7f19df79d7ca199a33e538d764')
              THEN 'neg_guardar_recusa_orcamento não ficou como desenhada' END),
        (CASE WHEN (SELECT count(*) FROM pg_catalog.pg_proc p
                    WHERE p.pronamespace = 'public'::regnamespace
                      AND p.proname::text IN ('neg_guardar_recusa_orcamento', 'neg_guardar_config_negocios')) <> 2
              THEN 'há mais do que uma versão de neg_guardar_recusa_orcamento ou de neg_guardar_config_negocios' END),
        (CASE WHEN md5(pg_catalog.pg_get_functiondef(
                     pg_catalog.to_regprocedure('public.neg_guardar_config_negocios(uuid,text,text,text,text,integer)')))
                   IS DISTINCT FROM '39b53c656e2ba226ff82e2b9bc360dfb'
              THEN 'neg_guardar_config_negocios mudou' END)
      ) AS e(motivo)) AS f;

COMMIT;
