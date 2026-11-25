-- =============================================================================
-- Nome unico da ficha (anew_entities.display_name), base PRINCIPAL.
--
-- Regra (decisao D1 do dono), igual em todos os caminhos de escrita:
--   * ha empresa            -> o nome e a empresa;
--   * pessoa sem empresa    -> nome + apelido (a mesma deduplicacao do
--                              composeDisplayName do ecra);
--   * organizacao sem empresa, ou pessoa sem nome nem apelido -> fica o
--                              display_name que veio (nao ha nada com que compor).
--
-- O que faz, por esta ordem:
--   1. coluna anew_entities.company_name (opcional, sem default: so metadados);
--   2. funcoes puras: fn_entity_display_name (a regra) e
--      fn_lead_company_from_field_values (a empresa de uma lead, com as MESMAS
--      chaves e a mesma ordem do ecra de edicao da lead, AnewLeadEditDialog);
--   3. preenchimento de company_name (D2): SO onde a empresa das leads da ficha
--      ja e, hoje, o display_name. Nenhum display_name e reescrito; uma guarda
--      (md5 de todos os display_name antes e depois) aborta a migration se
--      algum mudasse;
--   4. gatilho BEFORE na ficha, trg_anew_entities_0_display_name (o «0» faz
--      com que corra ANTES de trg_anew_entities_search_text: os BEFORE do mesmo
--      evento correm por ordem alfabetica). Ao inserir aplica a regra; ao
--      actualizar so recompoe quando mudou nome, apelido, empresa ou tipo --
--      uma mudanca SO do display_name (rpc_update_user, edicao de organizacao)
--      e respeitada;
--   5. gatilho AFTER na lead, trg_anew_leads_sync_entity_company: quando a
--      empresa da lead muda, copia-a para a ficha (e o nome segue a regra).
--
-- O que NAO faz:
--   * nao muda nenhum nome ja guardado (D2) -- a primeira edicao futura de
--     nome/apelido/empresa de uma ficha com empresa e que passa o nome a empresa;
--   * nao toca em contratos (D3): contract_body_html/signed_by_name sao texto
--     guardado;
--   * nao muda nenhuma assinatura nem corpo de RPC existente
--     (rpc_update_lead, rpc_update_client, create_lead_entity_for_org, ...).
--
-- Fluxos que gravam um display_name explicito, e porque continuam iguais
-- (lidos no codigo, nao no remoto):
--   * rpc_update_user / handle_new_user / finalize_user_profile: pessoa so com
--     display_name (sem nome nem apelido) -> a regra devolve NULL -> fica;
--   * portal (20261117010000): first_name = display_name -> mesmo resultado;
--   * importacao CSV de leads: so display_name -> fica;
--   * organizacoes (register-company, rpc_create_organization, gatilho de
--     identidade da organizacao): tipo organization sem empresa -> fica;
--   * assistente de IA: first/last sao o nome partido por espacos -> o mesmo
--     texto, com os espacos repetidos colapsados.
--
-- Recursao: o gatilho da lead actualiza a ficha; os gatilhos da ficha
-- (sync_leads/sync_clients_search_text) escrevem so search_text nas leads e
-- nos clientes, e o gatilho da lead escuta field_values/entity_id. Nao ha ciclo.
--
-- Locks: a coluna nova pede ACCESS EXCLUSIVE em anew_entities ate ao fim da
-- transaccao. Os locks pedem-se ao inicio, pela mesma ordem do rpc_update_lead
-- (leads e depois fichas), com lock_timeout curto: se nao os conseguir, falha
-- depressa em vez de ficar a bloquear os ecras.
--
-- SUPOSICAO (nao confirmada no catalogo do remoto, so nas migrations):
--   * nenhum gatilho/funcao com estes nomes existe la, nem a coluna
--     company_name (ADD COLUMN sem IF NOT EXISTS de proposito: se existir,
--     a migration falha em vez de assumir);
--   * o supabase db push corre este ficheiro numa so transaccao;
--   * os tipos de ficha usados sao 'person' e 'organization'; qualquer outro
--     tipo e tratado como organizacao (nao se compoe nome + apelido).
--
-- Reversao (fora da pasta das migrations, nunca aqui): larga os dois
-- gatilhos e as quatro funcoes e deixa a coluna.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '120s';

LOCK TABLE public.anew_leads IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.anew_entities IN ACCESS EXCLUSIVE MODE;

-- 1. Coluna ---------------------------------------------------------------------
ALTER TABLE public.anew_entities ADD COLUMN company_name text;

COMMENT ON COLUMN public.anew_entities.company_name IS
  'Empresa da ficha. Se preenchida, o display_name e a empresa (gatilho trg_anew_entities_0_display_name). Mantida a partir da empresa da lead por trg_anew_leads_sync_entity_company.';

-- 2. Funcoes puras ----------------------------------------------------------------

-- A regra. Espelho em TS: composeEntityDisplayName (src/lib/entityDisplayName.ts).
-- NULL quer dizer «nao ha regra que se aplique: fica o display_name que la esta».
CREATE FUNCTION public.fn_entity_display_name(
  p_type text,
  p_first text,
  p_last text,
  p_company text
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN n.c <> '' THEN n.c
    WHEN p_type IS DISTINCT FROM 'person' THEN NULL
    WHEN n.f = '' AND n.l = '' THEN NULL
    WHEN n.f = '' THEN n.l
    WHEN n.l = '' THEN n.f
    WHEN lower(n.f) = lower(n.l) THEN n.f
    WHEN starts_with(lower(n.l), lower(n.f) || ' ') THEN n.l
    WHEN right(lower(n.f), char_length(lower(n.l)) + 1) = ' ' || lower(n.l) THEN n.f
    ELSE n.f || ' ' || n.l
  END
  FROM (
    SELECT
      btrim(regexp_replace(coalesce(p_first, ''), '\s+', ' ', 'g'), ' ') AS f,
      btrim(regexp_replace(coalesce(p_last, ''), '\s+', ' ', 'g'), ' ') AS l,
      btrim(regexp_replace(coalesce(p_company, ''), '\s+', ' ', 'g'), ' ') AS c
  ) AS n;
$$;

COMMENT ON FUNCTION public.fn_entity_display_name(text, text, text, text) IS
  'Nome da ficha: empresa se houver; senao, numa pessoa, nome + apelido (composeDisplayName); senao NULL (fica o que la esta).';

-- A empresa de uma lead, lida como o ecra de edicao a le (getGeneralFieldValue
-- com GENERAL_FIELD_ALIASES.company_name, pela mesma ordem):
--   NULL -> nenhuma das chaves existe (a lead nao fala de empresa: nao mexer);
--   ''   -> a chave existe mas esta vazia (a empresa foi apagada);
--   texto -> a primeira chave com valor.
CREATE FUNCTION public.fn_lead_company_from_field_values(p_field_values jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_val jsonb;
  v_has_key boolean := false;
BEGIN
  IF p_field_values IS NULL OR jsonb_typeof(p_field_values) <> 'object' THEN
    RETURN NULL;
  END IF;

  FOREACH v_key IN ARRAY ARRAY['company_name', 'empresa', 'company', 'nome_empresa', 'organizacao', 'organização']
  LOOP
    IF p_field_values ? v_key THEN
      v_has_key := true;
      v_val := p_field_values -> v_key;
      IF jsonb_typeof(v_val) = 'null'
         OR (jsonb_typeof(v_val) = 'string' AND (v_val #>> '{}') = '') THEN
        CONTINUE;
      END IF;
      IF jsonb_typeof(v_val) = 'object' THEN
        RETURN coalesce(nullif(v_val ->> 'address_line1', ''),
                        nullif(v_val ->> 'street', ''),
                        nullif(v_val ->> 'value', ''),
                        '');
      END IF;
      RETURN v_val #>> '{}';
    END IF;
  END LOOP;

  RETURN CASE WHEN v_has_key THEN '' ELSE NULL END;
END;
$$;

COMMENT ON FUNCTION public.fn_lead_company_from_field_values(jsonb) IS
  'Empresa de uma lead com as chaves do AnewLeadEditDialog. NULL = sem chave de empresa; vazio = chave sem valor.';

-- Puras e internas: so os gatilhos as chamam (os gatilhos sao SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.fn_entity_display_name(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entity_display_name(text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_lead_company_from_field_values(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lead_company_from_field_values(jsonb) TO service_role;

-- 3. Preenchimento de company_name, com guarda ---------------------------------
-- Antes de existirem os gatilhos, por isso nenhum nome e recomposto.
-- So se preenche quando:
--   * todas as leads vivas da ficha que tem empresa concordam numa so empresa;
--   * o display_name da ficha e, hoje, exactamente essa empresa (espacos
--     colapsados) -- a empresa ja determina o nome (D2);
--   * a ficha nao e de um utilizador nem de uma organizacao da plataforma, e
--     nao e usada por leads ou clientes de outra organizacao-raiz (as mesmas
--     exclusoes do gatilho da lead).
-- O gatilho de auditoria fica em silencio so neste passo (nao ha mudanca visivel).
DO $$
DECLARE
  v_md5_before text;
  v_md5_after  text;
  v_total      bigint;
  v_filled     bigint;
  v_bad        bigint;
BEGIN
  SELECT md5(coalesce(string_agg(e.id::text || '=' || e.display_name, E'\n' ORDER BY e.id), '')),
         count(*)
    INTO v_md5_before, v_total
    FROM public.anew_entities e;

  PERFORM set_config('app.audit_bypass', 'on', true);

  WITH lead_company AS (
    SELECT l.entity_id,
           nullif(btrim(regexp_replace(
             coalesce(public.fn_lead_company_from_field_values(l.field_values), ''),
             '\s+', ' ', 'g'), ' '), '') AS company
      FROM public.anew_leads l
     WHERE l.entity_id IS NOT NULL
       AND l.deleted_at IS NULL
  ),
  agreed AS (
    SELECT lc.entity_id, min(lc.company) AS company
      FROM lead_company lc
     WHERE lc.company IS NOT NULL
     GROUP BY lc.entity_id
    HAVING count(DISTINCT lc.company) = 1
  )
  UPDATE public.anew_entities e
     SET company_name = a.company
    FROM agreed a
   WHERE e.id = a.entity_id
     AND e.company_name IS NULL
     AND btrim(regexp_replace(e.display_name, '\s+', ' ', 'g'), ' ') = a.company
     AND NOT EXISTS (SELECT 1 FROM public.anew_users u WHERE u.entity_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = e.id)
     AND (SELECT count(DISTINCT x.root_organization_id)
            FROM (SELECT l2.root_organization_id FROM public.anew_leads l2 WHERE l2.entity_id = e.id
                  UNION ALL
                  SELECT c2.root_organization_id FROM public.anew_clients c2 WHERE c2.entity_id = e.id) AS x) <= 1;

  PERFORM set_config('app.audit_bypass', '', true);

  SELECT md5(coalesce(string_agg(e.id::text || '=' || e.display_name, E'\n' ORDER BY e.id), ''))
    INTO v_md5_after
    FROM public.anew_entities e;

  IF v_md5_after IS DISTINCT FROM v_md5_before THEN
    RAISE EXCEPTION 'GUARDA: algum display_name mudou durante o preenchimento de company_name (antes %, depois %)',
      v_md5_before, v_md5_after;
  END IF;

  SELECT count(DISTINCT e.id) INTO v_filled
    FROM public.anew_entities e
   WHERE e.company_name IS NOT NULL;

  -- Cada empresa preenchida tem de ser o proprio nome da ficha.
  SELECT count(DISTINCT e.id) INTO v_bad
    FROM public.anew_entities e
   WHERE e.company_name IS NOT NULL
     AND btrim(regexp_replace(e.display_name, '\s+', ' ', 'g'), ' ') IS DISTINCT FROM e.company_name;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'GUARDA: % fichas com company_name diferente do display_name', v_bad;
  END IF;

  RAISE NOTICE 'nome unico: % fichas no total, % com company_name preenchida, 0 display_name alterados',
    v_total, v_filled;
END $$;

-- 4. Gatilho da ficha -------------------------------------------------------------
-- SECURITY DEFINER so para poder chamar a funcao pura (revogada a anon e
-- authenticated); nao le nem escreve nenhuma tabela, so mexe no NEW.
CREATE FUNCTION public.fn_anew_entities_display_name_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.first_name   IS NOT DISTINCT FROM OLD.first_name
     AND NEW.last_name    IS NOT DISTINCT FROM OLD.last_name
     AND NEW.company_name IS NOT DISTINCT FROM OLD.company_name
     AND NEW.type         IS NOT DISTINCT FROM OLD.type THEN
    -- So mudou o display_name (ou nada do que compoe o nome): e explicito, fica.
    RETURN NEW;
  END IF;

  v_name := public.fn_entity_display_name(NEW.type, NEW.first_name, NEW.last_name, NEW.company_name);
  IF v_name IS NOT NULL THEN
    NEW.display_name := v_name;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_anew_entities_display_name_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_anew_entities_display_name_trigger() TO service_role;

CREATE TRIGGER trg_anew_entities_0_display_name
  BEFORE INSERT OR UPDATE OF first_name, last_name, company_name, type, display_name
  ON public.anew_entities
  FOR EACH ROW EXECUTE FUNCTION public.fn_anew_entities_display_name_trigger();

-- 5. Gatilho da lead ---------------------------------------------------------------
-- SECURITY DEFINER porque a ficha tem RLS propria e a lead pode ser escrita por
-- quem nao edita a ficha directamente. Por isso nao segue fichas que nao sao
-- desta organizacao-raiz: de utilizadores, de organizacoes da plataforma, ou
-- usadas por leads/clientes de outra raiz -- senao mudar a empresa de uma lead
-- renomeava a ficha que outra organizacao ve.
CREATE FUNCTION public.fn_anew_leads_sync_entity_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw      text;
  v_company  text;
  v_current  text;
BEGIN
  IF NEW.entity_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  v_raw := public.fn_lead_company_from_field_values(NEW.field_values);
  IF v_raw IS NULL THEN
    RETURN NULL; -- a lead nao tem campo de empresa: nao mexe
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
     AND v_raw IS NOT DISTINCT FROM public.fn_lead_company_from_field_values(OLD.field_values) THEN
    RETURN NULL; -- a empresa desta lead nao mudou
  END IF;

  v_company := nullif(btrim(regexp_replace(v_raw, '\s+', ' ', 'g'), ' '), '');

  SELECT e.company_name INTO v_current
    FROM public.anew_entities e
   WHERE e.id = NEW.entity_id;
  IF NOT FOUND OR v_current IS NOT DISTINCT FROM v_company THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.anew_users u WHERE u.entity_id = NEW.entity_id)
     OR EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = NEW.entity_id)
     OR EXISTS (SELECT 1 FROM public.anew_leads l
                 WHERE l.entity_id = NEW.entity_id
                   AND l.root_organization_id IS DISTINCT FROM NEW.root_organization_id)
     OR EXISTS (SELECT 1 FROM public.anew_clients c
                 WHERE c.entity_id = NEW.entity_id
                   AND c.root_organization_id IS DISTINCT FROM NEW.root_organization_id) THEN
    RETURN NULL;
  END IF;

  -- display_name vai no SET para disparar os gatilhos UPDATE OF display_name
  -- (search_text da ficha, das leads e dos clientes); o gatilho da ficha
  -- recompoe-o na mesma.
  UPDATE public.anew_entities e
     SET company_name = v_company,
         display_name = coalesce(
           public.fn_entity_display_name(e.type, e.first_name, e.last_name, v_company),
           e.display_name)
   WHERE e.id = NEW.entity_id;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_anew_leads_sync_entity_company() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_anew_leads_sync_entity_company() TO service_role;

CREATE TRIGGER trg_anew_leads_sync_entity_company
  AFTER INSERT OR UPDATE OF field_values, entity_id
  ON public.anew_leads
  FOR EACH ROW
  WHEN (NEW.entity_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_anew_leads_sync_entity_company();

-- 6. Conferir ----------------------------------------------------------------------
DO $$
DECLARE
  v_txt text;
BEGIN
  -- Coluna opcional e sem default
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'anew_entities'
       AND column_name = 'company_name' AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'CONFERIR: anew_entities.company_name em falta, obrigatoria ou com default';
  END IF;

  -- O gatilho do nome corre antes do do search_text (ordem alfabetica, BEFORE)
  SELECT string_agg(t.tgname::text, ',' ORDER BY t.tgname::text COLLATE "C") INTO v_txt
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname::text = 'public' AND c.relname::text = 'anew_entities'
     AND NOT t.tgisinternal
     AND t.tgname::text IN ('trg_anew_entities_0_display_name', 'trg_anew_entities_search_text');
  IF v_txt IS DISTINCT FROM 'trg_anew_entities_0_display_name,trg_anew_entities_search_text' THEN
    RAISE EXCEPTION 'CONFERIR: gatilhos BEFORE da ficha fora de ordem ou em falta: %', coalesce(v_txt, '(nenhum)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname::text = 'public' AND c.relname::text = 'anew_leads'
       AND t.tgname::text = 'trg_anew_leads_sync_entity_company'
  ) THEN
    RAISE EXCEPTION 'CONFERIR: trg_anew_leads_sync_entity_company em falta';
  END IF;

  -- Uma so versao de cada funcao nova, com search_path fixo
  SELECT string_agg(p.proname::text || '/' || p.pronargs::text, ',' ORDER BY p.proname::text COLLATE "C") INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('fn_entity_display_name', 'fn_lead_company_from_field_values',
                             'fn_anew_entities_display_name_trigger', 'fn_anew_leads_sync_entity_company')
     AND p.proconfig IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search\_path=%');
  IF v_txt IS DISTINCT FROM 'fn_anew_entities_display_name_trigger/0,fn_anew_leads_sync_entity_company/0,fn_entity_display_name/4,fn_lead_company_from_field_values/1' THEN
    RAISE EXCEPTION 'CONFERIR: funcoes novas em falta, duplicadas ou sem search_path: %', coalesce(v_txt, '(nenhuma)');
  END IF;

  -- Ninguem de fora as chama
  IF has_function_privilege('anon', 'public.fn_entity_display_name(text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_entity_display_name(text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_lead_company_from_field_values(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_lead_company_from_field_values(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: funcoes puras abertas a anon/authenticated';
  END IF;

  -- A regra, com os casos do desenho (os mesmos do teste em TS)
  IF public.fn_entity_display_name('person', 'Rui', 'Silva', 'EVOLAR MOVEIS LDA') IS DISTINCT FROM 'EVOLAR MOVEIS LDA'
     OR public.fn_entity_display_name('person', '  Rui ', ' Silva  ', '   ') IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('person', 'Rui Silva', 'Rui Silva', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('person', 'Rui', 'Rui Silva', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('person', 'Rui Silva', 'silva', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('organization', NULL, NULL, NULL) IS NOT NULL
     OR public.fn_entity_display_name('organization', 'Ana', 'Costa', NULL) IS NOT NULL
     OR public.fn_entity_display_name('person', '', NULL, '') IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: fn_entity_display_name nao cumpre os casos do desenho';
  END IF;

  IF public.fn_lead_company_from_field_values('{"nome":"Rui"}'::jsonb) IS NOT NULL
     OR public.fn_lead_company_from_field_values('{"empresa":""}'::jsonb) IS DISTINCT FROM ''
     OR public.fn_lead_company_from_field_values('{"company_name":"","empresa":"X"}'::jsonb) IS DISTINCT FROM 'X' THEN
    RAISE EXCEPTION 'CONFERIR: fn_lead_company_from_field_values nao le as chaves como o ecra';
  END IF;
END $$;
