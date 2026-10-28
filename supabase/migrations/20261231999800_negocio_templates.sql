-- RASCUNHO, NADA APLICADO. Base RH (uetjghdkwbywbftedtth). Não é uma migration até ser revista (ecc:database-reviewer e ecc:security-reviewer)
-- e copiada para supabase/migrations com este mesmo nome (20261231999800_negocio_templates.sql). Desenho: NOVO-20261231999800_negocio_templates.DESENHO.md
--
-- Templates nos documentos do Negócio (ficha do Pipeline): o template do tipo orçamento (proposal_templates, template_type = 'quote') na
-- versão actual do orçamento, o template do tipo proposta (template_type = 'proposal') na proposta do negócio, e a minuta
-- (client_contract_templates), as respostas às perguntas {{chave}} e o texto final na versão actual do contrato.
--
-- NÃO MEXE em neg_guardar_negocio, neg_ler_negocios, fn_neg_ler_orcamento, fn_neg_ler_contrato nem em nenhuma migration do Ben
-- (20261231900000 a 20261231994000). Só junta três funções novas:
--   neg_definir_templates_negocio(p_negocio_id uuid, p_dados jsonb)  grava (pessoas.edit)
--   neg_ler_templates_negocio(p_negocio_id uuid)                     lê (pessoas.view)
--   fn_neg_templates_estado(p_negocio_id uuid)                       privada: o estado que as duas devolvem (sem verificação; só o dono)
-- Sem colunas novas: quotes.template_id, proposals.template_id/template_snapshot e client_contracts.contract_template_id/prompt_values/
-- contract_body_html já existem (catálogo, 28/10). quotes.template_id não tem chave estrangeira: a validação é desta função.
-- O template_snapshot da proposta NÃO se aceita do cliente: escreve-o o gatilho que já existe (proposal_freeze_template_snapshot) quando o
-- template_id muda; o do contrato idem (contract_freeze_template_snapshot), quando muda a minuta, as respostas ou o texto.
--
-- ORDEM OBRIGATÓRIA: testes contra o remoto ainda sem isto (o vermelho é agora: as funções não existem); migration list --linked (pendente
-- só este ficheiro); db push --linked --dry-run; db push --linked; só depois publicar o código da ficha que as chama. Nunca na Mudelar.
-- O que muda para quem já usa (Mudelar incluída): nada; funções novas, sem colunas, sem gatilhos, sem tocar nas existentes.
--
-- Versões de partida, confirmadas em 28/10 por pg_get_functiondef no remoto (a guarda recusa correr se alguma tiver mudado):

SET lock_timeout = '5s';

-- -----------------------------------------------------------------------------
-- 0. Guarda de partida
-- -----------------------------------------------------------------------------
DO $guarda$
DECLARE
  r     record;
  v_def text;
  v_n   integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.fn_cat_exigir(uuid,text)',                                         '98ee70b0095aed371e0a1095ddfb0e2e'),
    ('public.fn_neg_docs_crm(uuid)',                                            'a4b981e9a260aebc502759fe938bea28'),
    ('public.proposal_freeze_template_snapshot()',                              '2fa58ee3866b7be1a453bfed978aea61'),
    ('public.contract_freeze_template_snapshot()',                              'bc0992ddeb603c7c44e99d1f435ae16c'),
    ('public.resolve_proposal_template_snapshot(uuid,uuid)',                    'f4586ff33de59109cf7fc18c6978733f'),
    ('public.resolve_contract_template_snapshot(uuid,uuid,uuid,boolean)',       'e10a2f5513ec7e08b270be867ccda932'),
    -- as do Ben não se tocam; confere-se que continuam as de 20261231994000, porque a escolha da versão actual copia as regras delas
    ('public.neg_guardar_negocio(uuid,uuid,jsonb)',                             '1290a6d7566ee7cb7b69622cdc49ae45'),
    ('public.neg_ler_negocios(uuid)',                                           'abab64fad1a7327344c0bedc5b6262d7')
  ) AS t(assinatura, h) LOOP
    IF to_regprocedure(r.assinatura) IS NULL THEN
      RAISE EXCEPTION 'Guarda: % não existe.', r.assinatura;
    END IF;
    v_def := pg_get_functiondef(to_regprocedure(r.assinatura));
    IF md5(v_def) <> r.h THEN
      RAISE EXCEPTION 'Guarda: % mudou desde 28/10 (md5 %); rever este rascunho contra o texto vivo.', r.assinatura, md5(v_def);
    END IF;
  END LOOP;

  -- as colunas de que depende, com o tipo esperado
  SELECT count(*) INTO v_n
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND (c.table_name::text, c.column_name::text, c.data_type::text) IN (
      ('quotes', 'template_id', 'uuid'),
      ('proposals', 'template_id', 'uuid'),
      ('proposals', 'template_snapshot', 'jsonb'),
      ('client_contracts', 'contract_template_id', 'uuid'),
      ('client_contracts', 'prompt_values', 'jsonb'),
      ('client_contracts', 'contract_body_html', 'text'),
      ('proposal_templates', 'template_type', 'text'),
      ('proposal_templates', 'is_active', 'boolean'),
      ('client_contract_templates', 'is_active', 'boolean'));
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'Guarda: faltam colunas esperadas (encontradas %/9).', v_n;
  END IF;

  -- as três funções novas: ou não existem, ou são desta migration (re-execução)
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname::text IN ('neg_definir_templates_negocio', 'neg_ler_templates_negocio', 'fn_neg_templates_estado', 'fn_neg_templates_uuid')
    AND position('20261231999800' IN coalesce(pg_catalog.obj_description(p.oid, 'pg_proc'), '')) = 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: já existe uma função com o nome de uma das novas que não é desta migration.';
  END IF;
END
$guarda$;

-- -----------------------------------------------------------------------------
-- 1. Privada: um uuid vindo do JSON. Ausente/null = NULL (nenhum template); texto que não é uuid = NE006.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_neg_templates_uuid(p_valor jsonb, p_campo text)
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_valor IS NULL OR jsonb_typeof(p_valor) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_valor) <> 'string'
     OR (p_valor #>> '{}') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'Dados inválidos: % tem de ser um identificador ou null.', p_campo USING ERRCODE = 'NE006';
  END IF;
  RETURN (p_valor #>> '{}')::uuid;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_templates_uuid(jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.fn_neg_templates_uuid(jsonb, text) IS 'Negócio, templates: lê um uuid do JSON (null = nenhum; outro = NE006). Uso interno. 20261231999800.';

-- -----------------------------------------------------------------------------
-- 2. Privada: o estado dos templates do negócio (sem verificação de permissão: só a chamam as duas RPC, depois de verificarem).
--    Versão actual do orçamento: a de versão mais alta do fluxo da Emylia que não está substituída (a mesma que neg_guardar_negocio
--    liga à proposta). Proposta: a única do negócio, a mesma que neg_guardar_negocio escolhe (a mais antiga não apagada).
--    Contrato: a versão mais alta do fluxo da Emylia (com versão, sem adenda).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_neg_templates_estado(p_negocio_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT q.id, q.versao, q.estado, q.template_id
    FROM quotes q
    WHERE q.negocio_id = p_negocio_id AND q.fluxo_emylia AND q.deleted_at IS NULL AND q.adenda_id IS NULL
      AND q.estado <> 'substituido'
    ORDER BY q.versao DESC NULLS LAST
    LIMIT 1
  ), p AS (
    SELECT p.id, p.status, p.template_id, p.template_snapshot
    FROM proposals p
    WHERE p.negocio_id = p_negocio_id AND coalesce(p.is_deleted, false) = false
    ORDER BY p.created_at
    LIMIT 1
  ), c AS (
    SELECT c.id, c.versao, c.status, c.contract_template_id, c.prompt_values, c.contract_body_html
    FROM client_contracts c
    WHERE c.negocio_id = p_negocio_id AND c.versao IS NOT NULL AND c.adenda_id IS NULL AND c.deleted_at IS NULL
    ORDER BY c.versao DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'negocio_id',                 p_negocio_id,
    'orcamento_id',               (SELECT q.id FROM q),
    'orcamento_versao',           (SELECT q.versao FROM q),
    'orcamento_editavel',         coalesce((SELECT q.estado NOT IN ('aceite', 'rejeitado', 'recusado') FROM q), false),
    'template_orcamento_id',      (SELECT q.template_id FROM q),
    'proposta_id',                (SELECT p.id FROM p),
    'proposta_editavel',          coalesce((SELECT coalesce(p.status, '') IN ('draft', 'sent', 'viewed') FROM p), false),
    'template_proposta_id',       (SELECT p.template_id FROM p),
    'template_proposta_snapshot', (SELECT p.template_snapshot FROM p),
    'contrato_id',                (SELECT c.id FROM c),
    'contrato_versao',            (SELECT c.versao FROM c),
    'contrato_editavel',          coalesce((SELECT c.status IN ('draft', 'changes_requested') FROM c), false),
    'minuta_id',                  (SELECT c.contract_template_id FROM c),
    'minuta_respostas',           (SELECT c.prompt_values FROM c),
    'contrato_corpo_html',        (SELECT c.contract_body_html FROM c));
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_templates_estado(uuid) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.fn_neg_templates_estado(uuid) IS 'Negócio, templates: o estado (orçamento, proposta, contrato actuais e os templates de cada um). Sem verificação de permissão: só para neg_ler_templates_negocio e neg_definir_templates_negocio. 20261231999800.';

-- -----------------------------------------------------------------------------
-- 3. Ler (pessoas.view). Negócio inexistente, apagado ou de outra organização: a mesma mensagem que a falta de permissão.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_ler_templates_negocio(p_negocio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  SELECT n.organization_id INTO v_org FROM negocios n WHERE n.id = p_negocio_id AND n.deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir(v_org, 'pessoas.view');
  RETURN public.fn_neg_templates_estado(p_negocio_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_ler_templates_negocio(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_ler_templates_negocio(uuid) TO authenticated;
COMMENT ON FUNCTION public.neg_ler_templates_negocio(uuid) IS 'Negócio, templates: lê o template do orçamento, o da proposta (com o snapshot congelado) e a minuta, respostas e texto do contrato actuais. pessoas.view. 20261231999800.';

-- -----------------------------------------------------------------------------
-- 4. Gravar (pessoas.edit). p_dados: objecto só com as chaves a mudar (as ausentes ficam como estão):
--      template_orcamento_id  uuid | null   proposal_templates do tipo 'quote', activo, da organização  -> quotes.template_id (versão actual)
--      template_proposta_id   uuid | null   proposal_templates do tipo 'proposal', activo, da organização -> proposals.template_id
--      minuta_id              uuid | null   client_contract_templates activa, da organização          -> client_contracts.contract_template_id
--      minuta_respostas       objeto | null { chave: texto }, chaves como {{chave}} (a-z, A-Z, 0-9, _)   -> client_contracts.prompt_values
--      contrato_corpo_html    texto | null  o texto final do contrato (como no CRM: compõe-o a aplicação)  -> client_contracts.contract_body_html
--    null = nenhum template (nunca se escolhe um por omissão aqui). Devolve o mesmo que neg_ler_templates_negocio.
--    Erros: CT001 sem permissão ou negócio desconhecido; NE005 negócio do CRM; NE006 dados inválidos; NE007 o documento ainda não existe;
--           NE008 o documento já não se pode mudar (decidido, enviado para assinatura ou assinado); NE009 template inválido.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_definir_templates_negocio(p_negocio_id uuid, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_chaves     CONSTANT text[] := ARRAY['template_orcamento_id', 'template_proposta_id', 'minuta_id', 'minuta_respostas', 'contrato_corpo_html'];
  c_max_corpo  CONSTANT integer := 1048576;
  c_max_resp   CONSTANT integer := 262144;
  c_max_chaves CONSTANT integer := 200;
  c_max_valor  CONSTANT integer := 5000;
  v_org        uuid;
  v_neg        negocios;
  v_e          jsonb;
  v_k          text;
  v_id         uuid;
  v_resp       jsonb;
  v_corpo      text;
  v_tem_minuta boolean;
  v_tem_resp   boolean;
  v_tem_corpo  boolean;
  v_x          record;
BEGIN
  -- 1. Permissão primeiro (antes de bloquear o que quer que seja); negócio desconhecido = a mesma mensagem.
  SELECT n.organization_id INTO v_org FROM negocios n WHERE n.id = p_negocio_id AND n.deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir(v_org, 'pessoas.edit');

  -- 2. Forma dos dados (NE006).
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION 'Dados inválidos: tem de ser um objecto.' USING ERRCODE = 'NE006';
  END IF;
  FOR v_k IN SELECT k.chave FROM jsonb_object_keys(p_dados) AS k(chave) LOOP
    IF NOT (v_k = ANY (c_chaves)) THEN
      RAISE EXCEPTION 'Dados inválidos: chave desconhecida (%).', left(v_k, 60) USING ERRCODE = 'NE006';
    END IF;
  END LOOP;

  v_tem_minuta := p_dados ? 'minuta_id';
  v_tem_resp   := p_dados ? 'minuta_respostas';
  v_tem_corpo  := p_dados ? 'contrato_corpo_html';

  IF v_tem_resp THEN
    v_resp := NULLIF(p_dados -> 'minuta_respostas', 'null'::jsonb);
    IF v_resp IS NOT NULL THEN
      IF jsonb_typeof(v_resp) <> 'object' OR octet_length(v_resp::text) > c_max_resp THEN
        RAISE EXCEPTION 'Dados inválidos: as respostas da minuta são um objecto { chave: texto } (até 256 KB).' USING ERRCODE = 'NE006';
      END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(v_resp)) > c_max_chaves THEN
        RAISE EXCEPTION 'Dados inválidos: até 200 respostas na minuta.' USING ERRCODE = 'NE006';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_each(v_resp) AS e(chave, valor)
                 WHERE e.chave !~ '^[a-zA-Z0-9_]{1,80}$'
                    OR jsonb_typeof(e.valor) <> 'string'
                    OR char_length(e.valor #>> '{}') > c_max_valor) THEN
        RAISE EXCEPTION 'Dados inválidos: cada resposta da minuta tem uma chave {{chave}} e um texto (até 5000 caracteres).' USING ERRCODE = 'NE006';
      END IF;
    END IF;
  END IF;

  IF v_tem_corpo THEN
    IF jsonb_typeof(p_dados -> 'contrato_corpo_html') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Dados inválidos: o texto do contrato é texto ou null.' USING ERRCODE = 'NE006';
    END IF;
    v_corpo := p_dados ->> 'contrato_corpo_html';
    IF v_corpo IS NOT NULL AND octet_length(v_corpo) > c_max_corpo THEN
      RAISE EXCEPTION 'Dados inválidos: o texto do contrato tem no máximo 1 MB.' USING ERRCODE = 'NE006';
    END IF;
  END IF;

  -- 3. O negócio, bloqueado (o mesmo bloqueio que o UPDATE de neg_guardar_negocio toma primeiro: as duas gravações não se cruzam, e a
  --    ordem negócio, orçamento, proposta, contrato é a mesma dela).
  SELECT n.* INTO v_neg FROM negocios n WHERE n.id = p_negocio_id AND n.organization_id = v_org AND n.deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  IF NOT coalesce(v_neg.fluxo_emylia, false) AND public.fn_neg_docs_crm(p_negocio_id) THEN
    RAISE EXCEPTION 'Este negócio é do CRM: abra-o em Contratos/Propostas.' USING ERRCODE = 'NE005';
  END IF;

  -- 4. Os documentos actuais, bloqueados, e o estado relido depois do bloqueio.
  v_e := public.fn_neg_templates_estado(p_negocio_id);
  PERFORM 1 FROM quotes q WHERE q.id = (v_e ->> 'orcamento_id')::uuid FOR UPDATE;
  PERFORM 1 FROM proposals p WHERE p.id = (v_e ->> 'proposta_id')::uuid FOR UPDATE;
  PERFORM 1 FROM client_contracts c WHERE c.id = (v_e ->> 'contrato_id')::uuid FOR UPDATE;
  v_e := public.fn_neg_templates_estado(p_negocio_id);

  -- 5. Template do tipo orçamento, na versão actual do orçamento.
  IF p_dados ? 'template_orcamento_id' THEN
    v_id := public.fn_neg_templates_uuid(p_dados -> 'template_orcamento_id', 'template_orcamento_id');
    IF v_e ->> 'orcamento_id' IS NULL THEN
      RAISE EXCEPTION 'Ainda não há orçamento neste negócio.' USING ERRCODE = 'NE007';
    END IF;
    IF NOT (v_e ->> 'orcamento_editavel')::boolean THEN
      RAISE EXCEPTION 'O orçamento já foi decidido pelo cliente: o template não muda.' USING ERRCODE = 'NE008';
    END IF;
    IF v_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM proposal_templates t
         WHERE t.id = v_id AND t.organization_id = v_org AND t.template_type = 'quote' AND t.is_active IS TRUE) THEN
      RAISE EXCEPTION 'Template de orçamento desconhecido, inactivo ou de outra organização.' USING ERRCODE = 'NE009';
    END IF;
    UPDATE quotes q SET template_id = v_id
    WHERE q.id = (v_e ->> 'orcamento_id')::uuid AND q.template_id IS DISTINCT FROM v_id;
  END IF;

  -- 6. Template do tipo proposta. O snapshot escreve-o o gatilho proposal_freeze_template_snapshot quando o template_id muda.
  IF p_dados ? 'template_proposta_id' THEN
    v_id := public.fn_neg_templates_uuid(p_dados -> 'template_proposta_id', 'template_proposta_id');
    IF v_e ->> 'proposta_id' IS NULL THEN
      RAISE EXCEPTION 'A proposta ainda não existe: nasce quando o orçamento é enviado.' USING ERRCODE = 'NE007';
    END IF;
    IF NOT (v_e ->> 'proposta_editavel')::boolean THEN
      RAISE EXCEPTION 'A proposta já foi decidida pelo cliente: o template não muda.' USING ERRCODE = 'NE008';
    END IF;
    IF v_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM proposal_templates t
         WHERE t.id = v_id AND t.organization_id = v_org AND t.template_type = 'proposal' AND t.is_active IS TRUE) THEN
      RAISE EXCEPTION 'Template de proposta desconhecido, inactivo ou de outra organização.' USING ERRCODE = 'NE009';
    END IF;
    UPDATE proposals p SET template_id = v_id
    WHERE p.id = (v_e ->> 'proposta_id')::uuid AND p.template_id IS DISTINCT FROM v_id;
  END IF;

  -- 7. Minuta, respostas e texto final, na versão actual do contrato (só em rascunho ou com alterações pedidas).
  IF v_tem_minuta OR v_tem_resp OR v_tem_corpo THEN
    v_id := CASE WHEN v_tem_minuta THEN public.fn_neg_templates_uuid(p_dados -> 'minuta_id', 'minuta_id') END;
    IF v_e ->> 'contrato_id' IS NULL THEN
      RAISE EXCEPTION 'Ainda não há contrato neste negócio.' USING ERRCODE = 'NE007';
    END IF;
    IF NOT (v_e ->> 'contrato_editavel')::boolean THEN
      RAISE EXCEPTION 'O contrato já foi enviado para assinatura ou fechado: a minuta e o texto não mudam.' USING ERRCODE = 'NE008';
    END IF;
    IF v_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM client_contract_templates t
         WHERE t.id = v_id AND t.organization_id = v_org AND t.is_active IS TRUE) THEN
      RAISE EXCEPTION 'Minuta desconhecida, inactiva ou de outra organização.' USING ERRCODE = 'NE009';
    END IF;
    SELECT c.contract_template_id, c.prompt_values, c.contract_body_html INTO v_x
    FROM client_contracts c WHERE c.id = (v_e ->> 'contrato_id')::uuid;
    IF v_tem_minuta THEN v_x.contract_template_id := v_id; END IF;
    IF v_tem_resp THEN v_x.prompt_values := v_resp; END IF;
    IF v_tem_corpo THEN v_x.contract_body_html := v_corpo; END IF;
    UPDATE client_contracts c
    SET contract_template_id = v_x.contract_template_id,
        prompt_values        = v_x.prompt_values,
        contract_body_html   = v_x.contract_body_html
    WHERE c.id = (v_e ->> 'contrato_id')::uuid
      AND (c.contract_template_id, c.prompt_values, c.contract_body_html)
          IS DISTINCT FROM (v_x.contract_template_id, v_x.prompt_values, v_x.contract_body_html);
  END IF;

  RETURN public.fn_neg_templates_estado(p_negocio_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_definir_templates_negocio(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_definir_templates_negocio(uuid, jsonb) TO authenticated;
COMMENT ON FUNCTION public.neg_definir_templates_negocio(uuid, jsonb) IS 'Negócio, templates: grava o template do orçamento (quotes.template_id), o da proposta (proposals.template_id; o snapshot é do gatilho) e a minuta, respostas e texto do contrato actuais. Só as chaves enviadas; null = nenhum. pessoas.edit. 20261231999800.';

-- -----------------------------------------------------------------------------
-- 5. Guarda final
-- -----------------------------------------------------------------------------
DO $final$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.neg_definir_templates_negocio(uuid,jsonb)', true,  true),
    ('public.neg_ler_templates_negocio(uuid)',           true,  true),
    ('public.fn_neg_templates_estado(uuid)',             true,  false),
    ('public.fn_neg_templates_uuid(jsonb,text)',         false, false)
  ) AS t(assinatura, definer, publica) LOOP
    IF to_regprocedure(r.assinatura) IS NULL THEN
      RAISE EXCEPTION 'Guarda final: % não ficou criada.', r.assinatura;
    END IF;
    IF (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure(r.assinatura)) IS DISTINCT FROM r.definer THEN
      RAISE EXCEPTION 'Guarda final: % com SECURITY inesperado.', r.assinatura;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, unnest(p.proconfig) AS cfg(v)
                   WHERE p.oid = to_regprocedure(r.assinatura) AND cfg.v LIKE 'search_path=%') THEN
      RAISE EXCEPTION 'Guarda final: % sem search_path fixo.', r.assinatura;
    END IF;
    IF has_function_privilege('anon', to_regprocedure(r.assinatura), 'EXECUTE') THEN
      RAISE EXCEPTION 'Guarda final: anon executa %.', r.assinatura;
    END IF;
    IF has_function_privilege('authenticated', to_regprocedure(r.assinatura), 'EXECUTE') IS DISTINCT FROM r.publica THEN
      RAISE EXCEPTION 'Guarda final: privilégio de authenticated em % diferente do esperado.', r.assinatura;
    END IF;
  END LOOP;
  -- as do Ben ficaram exactamente como estavam
  IF md5(pg_get_functiondef(to_regprocedure('public.neg_guardar_negocio(uuid,uuid,jsonb)'))) <> '1290a6d7566ee7cb7b69622cdc49ae45'
     OR md5(pg_get_functiondef(to_regprocedure('public.neg_ler_negocios(uuid)'))) <> 'abab64fad1a7327344c0bedc5b6262d7' THEN
    RAISE EXCEPTION 'Guarda final: uma função do Ben mudou.';
  END IF;
END
$final$;
