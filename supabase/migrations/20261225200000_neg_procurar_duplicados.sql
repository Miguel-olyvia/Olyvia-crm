-- ============================================================
-- 20261225200000_neg_procurar_duplicados
-- ============================================================
-- O que faz: função NOVA neg_procurar_duplicados, a procura de duplicados do
--   diálogo «Nova lead» de Pessoas (desenho: vault ficheiros/crm
--   ligacao-ui-p7-criar-lead-desenho.md, regra 1; e
--   pessoas-ng019-e-permissao-workflow-desenho.md, opção b1 + a1 + c).
--   Numa só chamada procura o email, o telefone e o NIF (hash) escritos e
--   devolve UMA LINHA POR PESSOA E CAMPO que coincide, para a UI saber que
--   campos coincidem e distinguir «email de P1 e telefone de P2».
-- Regras de coincidência (as de find_entity_matches, 20261225140000):
--   email sem maiúsculas nem espaços; telefone só dígitos, mínimo 7, um é
--   sufixo do outro; NIF por nif_hash (HMAC calculado na Edge Function, nunca
--   na base) e país.
-- Onde procura: só nas pessoas DESTA organização e, como informação, nas das
--   organizações do grupo que quem chama vê (get_org_group_ids ∩
--   get_user_visible_org_ids, o mesmo conjunto de find_entity_matches).
--   Pessoa da organização = ligação em anew_entity_org_links, lead viva,
--   cliente vivo ou papel vivo (as quatro vias; 60 das 243 pessoas da nike não
--   têm ligação própria e find_entity_matches não as via).
-- O que devolve (b1):
--   ambito 'organizacao': pessoa (número só desta resposta, para agrupar as
--     linhas da mesma pessoa), campo, visivel; entity_id e nome SÓ se quem
--     chama vê uma lead ou um cliente vivo dessa pessoa no seu âmbito
--     (leads.view/clients.view, chaves crm_scope_keys). Fora do âmbito vêm a
--     nulo: a UI mostra «Já existe uma pessoa com estes dados a que não tem
--     acesso» (caso 18 do P7).
--   ambito 'grupo': campo, organizacao_id e organizacao_nome (uma organização
--     que quem chama já vê); nunca pessoa, id ou nome.
--   Até 50 linhas.
-- Guardas, por esta ordem: valores (NG009); sessão (42501); organização do
--   utilizador com pessoas.view e configuração (NG008, como
--   neg_substituir_contacto); leads.create nesta organização
--   (fn_neg_tem_permissao_org, 42501); limite de pedidos (NG020).
--   Mensagens genéricas: nenhuma diz nada de outra organização.
-- Limite de pedidos (a1), em public.rate_limit_attempts (já existe; RLS sem
--   políticas, sem grants a anon/authenticated):
--   por utilizador 30 em 5 minutos e 200 por hora; por organização 2000 por
--   hora. Números PROPOSTOS no desenho (decisão D4, por confirmar). Bloqueio
--   consultivo por utilizador para dois pedidos simultâneos não passarem os
--   dois. Cada procura feita grava duas linhas (utilizador e organização) com
--   success = não houve coincidência; NUNCA o valor procurado nem um hash
--   dele. Uma recusa (NG008, 42501, NG020) não grava nada: a excepção desfaz.
--   A tabela não tem limpeza agendada (purge_old_rate_limit_attempts existe
--   mas não está no pg_cron): fica por fazer, à parte.
-- SECURITY DEFINER, e porquê: ler os contactos e as ligações de TODAS as
--   pessoas da organização (a RLS de leitura tem âmbito de dono: sem isto um
--   comercial não veria o duplicado de outro e criava um segundo) e escrever
--   no contador. Por isso a organização, a permissão e o âmbito de cada
--   pessoa são verificados explicitamente. search_path fixo; EXECUTE só para
--   authenticated. VOLATILE (escreve no contador; o supabase-js chama por
--   POST).
-- Erro novo: NG020 (demasiadas verificações). A UI acrescenta-o a errosNeg.ts.
-- O diálogo de duplicados de Leads e find_entity_matches NÃO mudam.
-- Nada da Mudelar: sem linha em negocio_workflow_config dá NG008.
-- A UI precisa de: chamar esta função (o NIF passa por uma Edge Function que
--   calcula o hash, como find-entity-matches-proxy); traduzir NG020; tratar a
--   linha sem entity_id como caso 18; regenerar os tipos.
-- Não depende da porta de get_user_visible_org_ids (retida): só a chama
--   com o id de quem chama.
-- Reversão: fora da pasta das migrations.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição: as funções de que depende são as lidas no remoto a 20/10.
DO $pre$
DECLARE
  v_txt text;
BEGIN
  IF pg_catalog.to_regprocedure('public.neg_procurar_duplicados(uuid,text,text,text,text)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid = p.pronamespace
                WHERE s.nspname = 'public' AND p.proname = 'neg_procurar_duplicados') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: neg_procurar_duplicados já existe; nada feito.';
  END IF;

  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_exigir_config(uuid)',          '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_tem_permissao_org(uuid,text)', '05943a6cfb0382a07322870262170c8d'),
              ('public.crm_scope_keys(text)',                '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',      '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',          '29782031244dd3b0842ca43b271e2bf1')
            ) AS e(sig, h)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL
               OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 20/10: %; nada feito.', v_txt;
  END IF;

  -- get_org_group_ids: o corpo (prosrc) é o de 20/10 (20261225190000 só lhe
  -- muda o search_path e as permissões).
  IF md5((SELECT p.prosrc FROM pg_catalog.pg_proc p
          WHERE p.oid = pg_catalog.to_regprocedure('public.get_org_group_ids(uuid)')))
     IS DISTINCT FROM '7dddef305d2a616e27dbee4f2e0631f4' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: get_org_group_ids mudou desde 20/10; nada feito.';
  END IF;

  -- O contador: colunas esperadas, dono postgres (o dono da função), RLS sem
  -- FORCE (o dono escreve), sem grants a anon nem authenticated.
  IF (SELECT count(*) FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'rate_limit_attempts'
        AND c.column_name IN ('bucket', 'identifier', 'success', 'created_at')) <> 4 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: rate_limit_attempts sem as colunas esperadas; nada feito.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
                 WHERE c.oid = 'public.rate_limit_attempts'::regclass
                   AND pg_catalog.pg_get_userbyid(c.relowner)::text = 'postgres'
                   AND c.relrowsecurity AND NOT c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: rate_limit_attempts mudou de dono ou de RLS; nada feito.';
  END IF;
  IF pg_catalog.has_table_privilege('anon', 'public.rate_limit_attempts', 'SELECT,INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.rate_limit_attempts', 'SELECT,INSERT') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: rate_limit_attempts ficou aberta a anon ou authenticated; nada feito.';
  END IF;

  -- NG020 ainda não é usado por nenhuma função.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE position('NG020' IN p.prosrc) > 0) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: o código NG020 já é usado por outra função; nada feito.';
  END IF;
END
$pre$;

CREATE FUNCTION public.neg_procurar_duplicados(
  p_organization_id uuid,
  p_email text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_nif_hash text DEFAULT NULL,
  p_pais text DEFAULT 'PT')
  RETURNS TABLE(
    pessoa integer,
    campo text,
    ambito text,
    entity_id uuid,
    nome text,
    visivel boolean,
    organizacao_id uuid,
    organizacao_nome text)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  c_bucket_utilizador   CONSTANT text    := 'neg_procurar_duplicados:utilizador';
  c_bucket_organizacao  CONSTANT text    := 'neg_procurar_duplicados:organizacao';
  c_max_utilizador_5min CONSTANT integer := 30;
  c_max_utilizador_hora CONSTANT integer := 200;
  c_max_organizacao_hora CONSTANT integer := 2000;
  v_uid       uuid := auth.uid();
  v_email     text := lower(NULLIF(btrim(p_email), ''));
  v_tel       text := NULLIF(btrim(p_telefone), '');
  v_dig       text;
  v_nif       text := lower(NULLIF(btrim(p_nif_hash), ''));
  v_pais      text := upper(COALESCE(NULLIF(btrim(p_pais), ''), 'PT'));
  v_orgs      uuid[];
  v_keys_pes  text[];
  v_keys_lead text[];
  v_keys_cli  text[];
  v_n_5min    integer;
  v_n_hora    integer;
  v_n_org     integer;
  v_linhas    integer;
BEGIN
  -- 1. Valores
  v_dig := regexp_replace(COALESCE(v_tel, ''), '[^0-9]', '', 'g');
  IF p_organization_id IS NULL
     OR (v_email IS NULL AND v_tel IS NULL AND v_nif IS NULL)
     OR (v_email IS NOT NULL AND (char_length(v_email) > 254
                                  OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
     OR (v_tel IS NOT NULL AND (char_length(v_tel) > 30
                                OR v_tel !~ '^\+?[0-9 ().-]+$'
                                OR char_length(v_dig) NOT BETWEEN 7 AND 15))
     OR (v_nif IS NOT NULL AND v_nif !~ '^[0-9a-f]{64}$')
     OR v_pais !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Valor inválido: organização, email, telefone (7 a 15 dígitos) ou NIF.'
      USING ERRCODE = 'NG009';
  END IF;

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

  -- 4. Quem procura duplicados é quem pode criar a lead nesta organização.
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'leads.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar leads nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5. Limite de pedidos (por utilizador e por organização).
  PERFORM pg_advisory_xact_lock(hashtextextended(c_bucket_utilizador || ':' || v_uid::text, 0));

  SELECT count(*) FILTER (WHERE r.created_at > now() - interval '5 minutes'),
         count(*)
    INTO v_n_5min, v_n_hora
  FROM public.rate_limit_attempts r
  WHERE r.bucket = c_bucket_utilizador
    AND r.identifier = v_uid::text
    AND r.created_at > now() - interval '1 hour';

  SELECT count(*) INTO v_n_org
  FROM public.rate_limit_attempts r
  WHERE r.bucket = c_bucket_organizacao
    AND r.identifier = p_organization_id::text
    AND r.created_at > now() - interval '1 hour';

  IF v_n_5min >= c_max_utilizador_5min
     OR v_n_hora >= c_max_utilizador_hora
     OR v_n_org >= c_max_organizacao_hora THEN
    RAISE EXCEPTION 'Demasiadas verificações seguidas. Tente de novo mais tarde.'
      USING ERRCODE = 'NG020';
  END IF;

  -- 6. Organizações onde se procura: esta e as do grupo que quem chama vê.
  v_orgs := ARRAY[p_organization_id]
         || ARRAY(SELECT g.id
                  FROM public.get_org_group_ids(p_organization_id) AS g(id)
                  WHERE g.id <> p_organization_id
                    AND g.id IN (SELECT public.get_user_visible_org_ids(v_uid)));

  -- 7. Âmbito de leitura de quem chama (para entity_id e nome).
  v_keys_lead := CASE WHEN public.has_anew_permission(v_uid, 'leads.view')
                      THEN public.crm_scope_keys('leads.view') ELSE ARRAY[]::text[] END;
  v_keys_cli  := CASE WHEN public.has_anew_permission(v_uid, 'clients.view')
                      THEN public.crm_scope_keys('clients.view') ELSE ARRAY[]::text[] END;

  -- 8. Procura.
  RETURN QUERY
  WITH universo AS (
    SELECT lk.entity_id AS ent, lk.organization_id AS org
    FROM public.anew_entity_org_links lk
    WHERE lk.organization_id = ANY (v_orgs)
    UNION
    SELECT l.entity_id, l.organization_id
    FROM public.anew_leads l
    WHERE l.organization_id = ANY (v_orgs) AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
    UNION
    SELECT c.entity_id, c.organization_id
    FROM public.anew_clients c
    WHERE c.organization_id = ANY (v_orgs) AND c.deleted_at IS NULL AND c.entity_id IS NOT NULL
    UNION
    SELECT er.entity_id, er.organization_id
    FROM public.anew_entity_roles er
    WHERE er.organization_id = ANY (v_orgs) AND er.deleted_at IS NULL AND er.entity_id IS NOT NULL
  ),
  entidades AS (
    SELECT DISTINCT u.ent FROM universo u
  ),
  coincide AS (
    SELECT em.entity_id AS ent, 'email'::text AS cmp
    FROM entidades e
    JOIN public.anew_entity_emails em ON em.entity_id = e.ent
    WHERE v_email IS NOT NULL
      AND lower(btrim(em.email)) = v_email
    UNION
    SELECT ph.entity_id, 'telefone'::text
    FROM entidades e
    JOIN public.anew_entity_phones ph ON ph.entity_id = e.ent
    WHERE v_tel IS NOT NULL
      AND char_length(regexp_replace(COALESCE(ph.phone_number, ''), '[^0-9]', '', 'g')) >= 7
      AND (regexp_replace(COALESCE(ph.phone_number, ''), '[^0-9]', '', 'g') LIKE '%' || v_dig
           OR v_dig LIKE '%' || regexp_replace(COALESCE(ph.phone_number, ''), '[^0-9]', '', 'g'))
    UNION
    SELECT aef.entity_id, 'nif'::text
    FROM entidades e
    JOIN public.anew_entity_fiscal_entities aef ON aef.entity_id = e.ent
    JOIN public.fiscal_entities fe ON fe.id = aef.fiscal_entity_id
    WHERE v_nif IS NOT NULL
      AND fe.nif_hash = v_nif
      AND fe.country_code = v_pais
  ),
  nesta AS (
    SELECT c.ent, c.cmp
    FROM coincide c
    WHERE EXISTS (SELECT 1 FROM universo u WHERE u.ent = c.ent AND u.org = p_organization_id)
  ),
  nesta_vista AS (
    SELECT n.ent,
           n.cmp,
           dense_rank() OVER (ORDER BY n.ent)::integer AS num,
           (EXISTS (SELECT 1 FROM public.anew_leads l
                    WHERE l.organization_id = p_organization_id AND l.entity_id = n.ent
                      AND l.deleted_at IS NULL
                      AND (l.organization_id::text || ':*' = ANY (v_keys_lead)
                           OR l.organization_id::text || ':' || l.assigned_to::text = ANY (v_keys_lead)
                           OR l.organization_id::text || ':' || l.created_by::text = ANY (v_keys_lead)))
            OR EXISTS (SELECT 1 FROM public.anew_clients c
                       WHERE c.organization_id = p_organization_id AND c.entity_id = n.ent
                         AND c.deleted_at IS NULL
                         AND (c.organization_id::text || ':*' = ANY (v_keys_cli)
                              OR c.organization_id::text || ':' || c.assigned_to::text = ANY (v_keys_cli)
                              OR c.organization_id::text || ':' || c.created_by::text = ANY (v_keys_cli))))
             AS ve
    FROM nesta n
  ),
  no_grupo AS (
    SELECT DISTINCT c.cmp, u.org
    FROM coincide c
    JOIN universo u ON u.ent = c.ent AND u.org <> p_organization_id
    WHERE NOT EXISTS (SELECT 1 FROM nesta n WHERE n.ent = c.ent)
  ),
  linhas AS (
    SELECT 1 AS ordem,
           nv.num AS r_pessoa,
           nv.cmp AS r_campo,
           'organizacao'::text AS r_ambito,
           CASE WHEN nv.ve THEN nv.ent END AS r_entity_id,
           CASE WHEN nv.ve THEN ent.display_name END AS r_nome,
           nv.ve AS r_visivel,
           p_organization_id AS r_org,
           NULL::text AS r_org_nome
    FROM nesta_vista nv
    LEFT JOIN public.anew_entities ent ON ent.id = nv.ent
    UNION ALL
    SELECT 2,
           NULL::integer,
           g.cmp,
           'grupo'::text,
           NULL::uuid,
           NULL::text,
           NULL::boolean,
           g.org,
           o.name::text
    FROM no_grupo g
    LEFT JOIN public.anew_organizations o ON o.id = g.org
  )
  SELECT x.r_pessoa, x.r_campo, x.r_ambito, x.r_entity_id, x.r_nome, x.r_visivel, x.r_org, x.r_org_nome
  FROM linhas x
  ORDER BY x.ordem, x.r_pessoa, x.r_campo, x.r_org_nome
  LIMIT 50;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  -- 9. Registo da tentativa (sem o valor procurado).
  INSERT INTO public.rate_limit_attempts (bucket, identifier, success)
  VALUES (c_bucket_utilizador,  v_uid::text,               v_linhas = 0),
         (c_bucket_organizacao, p_organization_id::text,   v_linhas = 0);

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_procurar_duplicados(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_procurar_duplicados(uuid, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.neg_procurar_duplicados(uuid, text, text, text, text) IS
  'Pessoas, «Nova lead»: procura email, telefone e NIF (hash) nas pessoas desta organização e, como informação, nas do grupo visível. Uma linha por pessoa e campo; entity_id e nome só no âmbito de leitura de quem chama. pessoas.view + configuração (NG008), leads.create (42501), limite por utilizador e organização (NG020). 20261225200000.';

-- CONFERIR
DO $conferir$
DECLARE
  v_oid oid := pg_catalog.to_regprocedure('public.neg_procurar_duplicados(uuid,text,text,text,text)');
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'CONFERIR: neg_procurar_duplicados não foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                 WHERE p.oid = v_oid AND p.prosecdef AND p.provolatile::text = 'v'
                   AND pg_catalog.pg_get_userbyid(p.proowner)::text = 'postgres'
                   AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]) THEN
    RAISE EXCEPTION 'CONFERIR: neg_procurar_duplicados sem DEFINER, VOLATILE, dono postgres ou search_path fixo';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) a
             WHERE p.oid = v_oid AND a.grantee = 0)
     OR pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: neg_procurar_duplicados executável por PUBLIC, anon ou service_role';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: neg_procurar_duplicados sem EXECUTE para authenticated';
  END IF;
  -- Sem sessão de utilizador (esta migration) recusa antes de procurar.
  BEGIN
    PERFORM * FROM public.neg_procurar_duplicados('b6ffce4f-f630-4933-833a-008649757a33'::uuid,
                                                  'conferir@exemplo.invalid', NULL, NULL, 'PT');
    RAISE EXCEPTION 'CONFERIR: sem sessão, neg_procurar_duplicados não recusou';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$conferir$;

COMMIT;
