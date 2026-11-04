-- ==============================================================================
-- Negocio: visitas vizinhas dos recursos num dia, para o ecra da visita do
-- negocio decidir quem consegue chegar a tempo (regra 13 do main: deslocacao e
-- pausa de almoco). So na base RH.
--
-- O CALCULO NAO E FEITO AQUI. Faz-se no cliente com o codigo do main copiado
-- tal e qual (supabase/functions/_shared/travelFeasibility.ts: checkTravelFeasible,
-- buildLunchBreakConfig, requiredTravelMinutes, haversineKm). Esta funcao so
-- devolve os dados de que ele precisa: a base de cada recurso, as visitas do
-- dia (inicio, fim, coordenadas) e a pausa de almoco da organizacao.
--
-- O CODIGO DO CLIENTE ENTRA JUNTO COM ESTA MIGRATION (mesmo PR, mesmo deploy):
--   src/hooks/pessoas/useDeslocacaoVisita.ts (chama a RPC),
--   src/hooks/pessoas/useDestinoVisita.ts, src/lib/addresses/procurarCodigoPostal.ts,
--   src/components/pessoas/negocioEmylia/QuemPodeIrVisita.tsx, types.ts.
-- E ADITIVA (uma funcao nova; nenhuma tabela, nenhuma funcao existente muda) e
-- o cliente TOLERA A FALTA: sem a funcao (PGRST202/42883) ou com qualquer erro
-- nela, o ecra fica exactamente como hoje (horas livres sem verificar a
-- deslocacao). Pode ser aplicada antes ou depois do codigo.
--
-- O QUE MUDA
--   neg_visitas_vizinhas(p_organization_id uuid, p_resource_ids uuid[], p_date date,
--                        p_exclude_item_id uuid DEFAULT NULL)
--     RETURNS jsonb, STABLE, SECURITY DEFINER, search_path vazio, so authenticated.
--   Devolve:
--     {
--       "recursos": [
--         { "resource_id": uuid, "resource_name": text,
--           "latitude": number|null, "longitude": number|null,   -- base, 2 casas
--           "visitas": [ { "inicio": timestamptz (ISO 8601),
--                          "fim":    timestamptz (ISO 8601),
--                          "lat": number|null, "lng": number|null } ] }  -- 2 casas
--       ],
--       "almoco": { "inicio": "HH:MM:SS"|null, "fim": "HH:MM:SS"|null,
--                   "minutos": int|null, "timezone": text }
--     }
--   Visitas: schedule_items da organizacao (si.organization_id) ligados ao
--   recurso por schedule_item_assignees, status diferente de 'cancelled', que
--   COMECAM no dia p_date local, menos p_exclude_item_id (a visita que se
--   remarca, como em neg_horas_livres_visita). No maximo 200 por recurso (as
--   primeiras do dia). Visitas sem coordenadas saem na mesma, com lat/lng
--   null: a regra do almoco do main conta-as.
--   Estados que contam: todos menos 'cancelled' (draft, scheduled, confirmed,
--   in_progress, completed, rescheduled), o mesmo filtro do main em todos os
--   sitios que juntam vizinhas (public-availability, book-slot,
--   ownerEligibility, rescheduleSlots, suggest-schedule-assignee) e de
--   neg_horas_livres_visita. 'rescheduled' e a propria visita viva com a hora
--   nova; 'draft' (auto-schedule) ja ocupa o recurso.
--   NUNCA sai o id da visita, morada, titulo, notas, cliente, entidade, negocio.
--   Recursos: so os desta organizacao e activos; os outros (de outra
--   organizacao, inexistentes, INACTIVOS, repetidos ou null) nao saem, em
--   silencio. O cliente trata um recurso pedido que nao vem na resposta como
--   "sem dados" (fica como hoje), NUNCA como "pode ir". Ordem: nome, id.
--   Almoco: schedule_settings da organizacao; tudo null quando nao configurado
--   (o CHECK schedule_settings_lunch_all_or_none garante 0 ou 3 preenchidos).
--
-- CORTE DO DIA: FUSO DA ORGANIZACAO, NAO UTC (diferenca assumida face ao main)
--   O dia e [p_date 00:00, p_date+1 00:00) no fuso de schedule_settings.timezone
--   (sem fuso ou fuso invalido: Europe/Lisbon, validado como em
--   neg_horas_livres_visita, sem pg_timezone_names). O main (public-availability)
--   corta pelo dia UTC (T00:00:00Z a T23:59:59.999Z). Em Lisboa no verao (UTC+1)
--   uma visita das 00:30 locais fica no dia certo aqui e no dia anterior no
--   main; fora dessa hora a seguir a meia-noite os dois coincidem. Em ambos,
--   uma visita que comeca na vespera e entra por este dia dentro nao conta.
--
-- COORDENADAS ARREDONDADAS A 2 CASAS DECIMAIS (cerca de 1 km), DE PROPOSITO
--   As das visitas e as da base do recurso. As visitas nao se filtram por
--   negocio (ver AMBITO); sem arredondar, quem so ve os seus negocios
--   receberia a localizacao exacta das obras de outros clientes e a da base
--   de cada recurso, que pode ser a morada de um trabalhador. A 2 casas
--   (cerca de 1,1 km de latitude, 0,9 km de longitude em Portugal) o erro no
--   tempo de viagem do main (haversine a 35 km/h) e de cerca de 2 a 3 minutos
--   no pior caso, aceitavel para decidir quem consegue ir; e deixa de
--   identificar a casa.
--
-- PERMISSAO E AMBITO (antes de ler qualquer dado)
--   1. Sessao e pessoas.view na organizacao: fn_cat_pode(p_org, 'pessoas.view'),
--      o mesmo predicado de fn_cat_exigir (que neg_horas_livres_visita usa),
--      mas com erro so por codigo (42501) em vez da mensagem com texto de
--      fn_cat_exigir (CT001 'Sem permissao (...)').
--   2. Organizacao CRM do utilizador (get_user_crm_org_ids), exigida em TODOS
--      os ramos, tambem ao system admin (como neg_sugestoes_submissoes e a
--      politica RESTRICTIVE system_admin_pii_default_deny de negocios,
--      20261227100000). O system admin nao tem passagem propria.
--   3. Ver negocios da organizacao, por um de dois caminhos:
--      a) papel do RH, com o criterio de fn_neg_papel_conta (20270105700000):
--         organizacao CRM + fn_neg_papel_permite(p_org, 'pessoas.edit');
--      b) a regra de negocios_select: has_anew_permission(uid, 'pessoas.view')
--         e uma chave de crm_scope_keys('pessoas.view') desta organizacao
--         (org:*, org:<si>).
--      Fora disto: 42501.
--   As visitas NAO sao filtradas linha a linha pelo ambito do negocio:
--   esconder uma vizinha faria o calculo dar "pode ir" quando nao pode. Quem
--   tem ambito "so os meus" recebe por isso horarios e zonas (cerca de 1 km,
--   sem id, sem morada, sem cliente) de visitas de negocios que nao ve. Com o
--   arredondamento e sem item_id o risco desce a "o recurso tem uma visita
--   das 10:00 as 11:00 perto de X"; se isso e aceitavel e DECISAO DE PRODUTO
--   por tomar pelo utilizador (alternativa: so org:* passa).
--   4. Limites: p_organization_id, p_resource_ids e p_date obrigatorios;
--      ate 50 elementos em p_resource_ids (contados antes de tirar repetidos).
--
-- CODIGOS DE ERRO (MESSAGE = codigo, sem texto livre)
--   42501 insufficient_privilege  sem sessao, sem pessoas.view, fora da
--                                 organizacao CRM ou sem ambito de negocios
--   NG009 pedido_invalido         argumentos nulos ou mais de 50 recursos
--
-- COMO SE REVERTE: sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION public.neg_visitas_vizinhas(uuid, uuid[], date, uuid);
--   (o cliente volta sozinho ao comportamento de hoje).
-- ==============================================================================

SET lock_timeout = '5s';

-- ---- Guardas -----------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  -- Dependencias: funcoes.
  IF to_regprocedure('public.fn_cat_pode(uuid, text)') IS NULL
     OR to_regprocedure('public.fn_neg_papel_permite(uuid, text)') IS NULL
     OR to_regprocedure('public.get_user_crm_org_ids(uuid)') IS NULL
     OR to_regprocedure('public.has_anew_permission(uuid, text)') IS NULL
     OR to_regprocedure('public.crm_scope_keys(text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta uma das funcoes de que a migration depende (permissao ou ambito).';
  END IF;

  -- Dependencias: tabelas.
  IF to_regclass('public.schedule_items') IS NULL
     OR to_regclass('public.schedule_item_assignees') IS NULL
     OR to_regclass('public.schedule_resources') IS NULL
     OR to_regclass('public.schedule_settings') IS NULL
     OR to_regclass('public.anew_permissions') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta uma das tabelas de que a migration depende.';
  END IF;

  -- Dependencias: colunas que a funcao le.
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.schedule_items') AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'organization_id', 'start_datetime', 'end_datetime', 'status',
                             'location_lat', 'location_lng');
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'Guarda: schedule_items nao tem as 7 colunas esperadas (encontradas %).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.schedule_item_assignees') AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('item_id', 'resource_id');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Guarda: schedule_item_assignees nao tem item_id e resource_id (encontradas % de 2).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.schedule_resources') AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'organization_id', 'is_active', 'name', 'latitude', 'longitude');
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'Guarda: schedule_resources nao tem as 6 colunas esperadas (encontradas %).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.schedule_settings') AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('organization_id', 'timezone', 'lunch_window_start', 'lunch_window_end',
                             'lunch_duration_minutes');
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'Guarda: schedule_settings nao tem as 5 colunas esperadas (encontradas %).', v_n;
  END IF;

  -- O estado 'cancelled' existe no tipo de schedule_items.status.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_enum e ON e.enumtypid = a.atttypid
                  WHERE a.attrelid = to_regclass('public.schedule_items') AND a.attname::text = 'status'
                    AND e.enumlabel::text = 'cancelled') THEN
    RAISE EXCEPTION 'Guarda: schedule_items.status nao tem o valor cancelled.';
  END IF;

  -- As permissoes reutilizadas existem (nenhuma nova).
  SELECT count(DISTINCT p.code) INTO v_n FROM public.anew_permissions p
   WHERE p.code IN ('pessoas.view', 'pessoas.edit');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Guarda: faltam permissoes no catalogo (encontradas % de 2).', v_n;
  END IF;

  -- Nada do que esta migration cria pode ja existir (nenhuma versao).
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.proname::text = 'neg_visitas_vizinhas';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: ja existe(m) % versao(oes) de neg_visitas_vizinhas. Investigar.', v_n;
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. A funcao
-- ==============================================================================
CREATE FUNCTION public.neg_visitas_vizinhas(
  p_organization_id uuid,
  p_resource_ids uuid[],
  p_date date,
  p_exclude_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  c_max_recursos constant integer := 50;
  c_max_visitas  constant integer := 200;
  c_casas        constant integer := 2;
  v_uid     uuid := auth.uid();
  v_ok      boolean := false;
  v_keys    text[];
  v_ids     uuid[];
  v_tz      text;
  v_ini_alm time;
  v_fim_alm time;
  v_min_alm integer;
  v_dia_ini timestamptz;
  v_dia_fim timestamptz;
  v_recursos jsonb;
BEGIN
  -- 1. Permissao (o predicado de fn_cat_exigir), antes de tudo.
  IF v_uid IS NULL OR NOT coalesce(public.fn_cat_pode(p_organization_id, 'pessoas.view'), false) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- 2. Organizacao CRM do utilizador, em todos os ramos (system admin incluido).
  IF NOT EXISTS (SELECT 1 FROM public.get_user_crm_org_ids(v_uid) AS o(id) WHERE o.id = p_organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- 3. Ver negocios da organizacao: papel do RH (criterio de fn_neg_papel_conta)
  --    ou a regra de negocios_select (permissao + chave de ambito da org).
  v_ok := coalesce(public.fn_neg_papel_permite(p_organization_id, 'pessoas.edit'), false);
  IF NOT v_ok AND coalesce(public.has_anew_permission(v_uid, 'pessoas.view'), false) THEN
    v_keys := coalesce(public.crm_scope_keys('pessoas.view'), ARRAY[]::text[]);
    v_ok := EXISTS (SELECT 1 FROM unnest(v_keys) AS k(k)
                     WHERE starts_with(k.k, p_organization_id::text || ':'));
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- 4. Limites.
  IF p_resource_ids IS NULL OR p_date IS NULL
     OR coalesce(cardinality(p_resource_ids), 0) > c_max_recursos THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'NG009';
  END IF;

  -- 5. Recursos: so os desta organizacao e activos; o resto nao sai, em silencio.
  SELECT coalesce(array_agg(r.id), ARRAY[]::uuid[]) INTO v_ids
    FROM public.schedule_resources r
   WHERE r.id = ANY (p_resource_ids)
     AND r.organization_id = p_organization_id
     AND r.is_active IS NOT FALSE;

  -- 6. Fuso e almoco da organizacao (fuso como em neg_horas_livres_visita:
  --    sem pg_timezone_names; invalido ou vazio = Europe/Lisbon).
  SELECT NULLIF(btrim(s.timezone::text), ''), s.lunch_window_start, s.lunch_window_end, s.lunch_duration_minutes
    INTO v_tz, v_ini_alm, v_fim_alm, v_min_alm
    FROM public.schedule_settings s
   WHERE s.organization_id = p_organization_id
   LIMIT 1;
  IF v_tz IS NULL THEN
    v_tz := 'Europe/Lisbon';
  ELSE
    BEGIN
      PERFORM now() AT TIME ZONE v_tz;
    EXCEPTION WHEN invalid_parameter_value THEN
      v_tz := 'Europe/Lisbon';
    END;
  END IF;

  -- 7. Visitas da organizacao que comecam no dia local [00:00, 24:00), menos
  --    a que se remarca; ate 200 por recurso; coordenadas a 2 casas.
  --    Uma so leitura das visitas, numerada por recurso e agregada por GROUP BY.
  IF cardinality(v_ids) = 0 THEN
    v_recursos := '[]'::jsonb;
  ELSE
    v_dia_ini := p_date::timestamp AT TIME ZONE v_tz;
    v_dia_fim := (p_date + 1)::timestamp AT TIME ZONE v_tz;

    WITH vis AS (
      SELECT DISTINCT sia.resource_id, si.id, si.start_datetime, si.end_datetime,
             si.location_lat, si.location_lng
        FROM public.schedule_item_assignees sia
        JOIN public.schedule_items si ON si.id = sia.item_id
       WHERE sia.resource_id = ANY (v_ids)
         AND si.organization_id = p_organization_id
         AND si.status <> 'cancelled'
         AND si.id IS DISTINCT FROM p_exclude_item_id
         AND si.start_datetime >= v_dia_ini
         AND si.start_datetime < v_dia_fim
    ), num AS (
      SELECT v.resource_id, v.id, v.start_datetime, v.end_datetime, v.location_lat, v.location_lng,
             row_number() OVER (PARTITION BY v.resource_id ORDER BY v.start_datetime, v.id) AS n
        FROM vis v
    ), agg AS (
      SELECT x.resource_id,
             jsonb_agg(jsonb_build_object(
               'inicio', x.start_datetime,
               'fim', x.end_datetime,
               'lat', round(x.location_lat::numeric, c_casas),
               'lng', round(x.location_lng::numeric, c_casas))
             ORDER BY x.start_datetime, x.id) AS visitas
        FROM num x
       WHERE x.n <= c_max_visitas
       GROUP BY x.resource_id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'resource_id', r.id,
             'resource_name', r.name,
             'latitude', round(r.latitude::numeric, c_casas),
             'longitude', round(r.longitude::numeric, c_casas),
             'visitas', coalesce(a.visitas, '[]'::jsonb))
           ORDER BY r.name, r.id), '[]'::jsonb)
      INTO v_recursos
      FROM public.schedule_resources r
      LEFT JOIN agg a ON a.resource_id = r.id
     WHERE r.id = ANY (v_ids);
  END IF;

  RETURN jsonb_build_object(
    'recursos', v_recursos,
    'almoco', jsonb_build_object(
      'inicio', CASE WHEN v_ini_alm IS NULL THEN NULL ELSE left(v_ini_alm::text, 8) END,
      'fim', CASE WHEN v_fim_alm IS NULL THEN NULL ELSE left(v_fim_alm::text, 8) END,
      'minutos', v_min_alm,
      'timezone', v_tz));
END;
$fn$;

-- ==============================================================================
-- 2. Privilegios e comentario
-- ==============================================================================
REVOKE ALL ON FUNCTION public.neg_visitas_vizinhas(uuid, uuid[], date, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.neg_visitas_vizinhas(uuid, uuid[], date, uuid) TO authenticated;

COMMENT ON FUNCTION public.neg_visitas_vizinhas(uuid, uuid[], date, uuid) IS
'Negocio (authenticated). Dados para o cliente calcular a deslocacao da visita (regra 13 do main, travelFeasibility.ts): {recursos: [{resource_id, resource_name, latitude, longitude, visitas: [{inicio, fim, lat, lng}]}], almoco: {inicio, fim, minutos, timezone}}. Coordenadas (base e visitas) arredondadas a 2 casas (cerca de 1 km), de proposito. Visitas da organizacao nao canceladas que comecam no dia local (fuso da organizacao, nao UTC), menos p_exclude_item_id, ate 200 por recurso. So recursos activos da organizacao (os outros nao saem; o cliente trata-os como sem dados). Nunca id da visita, morada nem dados do cliente. pessoas.view, organizacao CRM e ambito de negocios (papel pessoas.edit ou chave de ambito) (42501); nulos ou mais de 50 recursos (NG009). Desde 20270106700000.';

-- ==============================================================================
-- 3. Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  v_fn   text := 'public.neg_visitas_vizinhas(uuid, uuid[], date, uuid)';
  v_oid  oid := to_regprocedure('public.neg_visitas_vizinhas(uuid, uuid[], date, uuid)')::oid;
  v_auth oid := (SELECT r.oid FROM pg_roles r WHERE r.rolname::text = 'authenticated');
  v_n    integer;
  v_vol  text;
  v_st   text;
BEGIN
  -- 1. Existe com a assinatura de 4 argumentos, e e a unica versao.
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Conferir: neg_visitas_vizinhas(uuid, uuid[], date, uuid) nao existe.';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.proname::text = 'neg_visitas_vizinhas';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: esperada 1 versao de neg_visitas_vizinhas, encontradas %.', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_oid AND p.pronargdefaults = 1) THEN
    RAISE EXCEPTION 'Conferir: p_exclude_item_id devia ter valor por omissao.';
  END IF;

  -- 2. DEFINER, STABLE, devolve jsonb.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_oid AND p.prosecdef) THEN
    RAISE EXCEPTION 'Conferir: neg_visitas_vizinhas devia ser SECURITY DEFINER.';
  END IF;
  SELECT p.provolatile::text INTO v_vol FROM pg_proc p WHERE p.oid = v_oid;
  IF v_vol <> 's' THEN
    RAISE EXCEPTION 'Conferir: neg_visitas_vizinhas devia ser STABLE (esta %).', v_vol;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_oid AND p.prorettype = 'jsonb'::regtype) THEN
    RAISE EXCEPTION 'Conferir: neg_visitas_vizinhas devia devolver jsonb.';
  END IF;

  -- 3. search_path fixo e vazio.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = v_oid
                    AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'Conferir: neg_visitas_vizinhas nao tem search_path vazio.';
  END IF;

  -- 4. EXECUTE so do dono e de authenticated (aclexplode, PUBLIC incluido).
  SELECT count(*) INTO v_n
    FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = v_oid AND a.grantee <> p.proowner AND a.grantee <> v_auth;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: neg_visitas_vizinhas tem % privilegio(s) para alem do dono e de authenticated.', v_n;
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE')
     OR has_function_privilege('service_role', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: neg_visitas_vizinhas devia ser so de authenticated.';
  END IF;

  -- 5. A coluna organization_id de schedule_items (filtro das visitas) existe.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.schedule_items') AND a.attnum > 0
                    AND NOT a.attisdropped AND a.attname::text = 'organization_id') THEN
    RAISE EXCEPTION 'Conferir: schedule_items.organization_id nao existe.';
  END IF;

  -- 6. Sem sessao (como corre a migration), recusa com 42501 antes de ler.
  BEGIN
    PERFORM public.neg_visitas_vizinhas('00000000-0000-0000-0000-000000000000'::uuid,
                                        ARRAY[]::uuid[], current_date, NULL::uuid);
    RAISE EXCEPTION 'Conferir: neg_visitas_vizinhas respondeu sem sessao.' USING ERRCODE = 'P0001';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_st = RETURNED_SQLSTATE;
      RAISE EXCEPTION 'Conferir: sem sessao devia dar 42501 e deu %.', v_st;
  END;
END;
$conferir$;

RESET lock_timeout;
