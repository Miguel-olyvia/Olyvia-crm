-- ============================================================
-- 20261223130000_neg_guardar_visita
-- ============================================================
-- O que faz: função NOVA neg_guardar_visita, que marca uma visita da página
--   Pessoas no calendário (pelo rpc_create_schedule_item existente) e, na
--   mesma transacção, lhe escreve o tipo (visit_kind) e o negócio
--   (negocio_id), que esse rpc não aceita.
-- SECURITY DEFINER (a única desta fase): o segundo passo é o resto do INSERT,
--   não uma edição, e sob INVOKER exigiria scheduling.items.edit a quem só
--   tem scheduling.items.create. Como DEFINER ignora a RLS, verifica tudo
--   explicitamente, por esta ordem: sessão; organização do utilizador com
--   pessoas.view e com linha de configuração (NG008); pessoa visível pelo
--   âmbito de leads.view ou clients.view (NG003); quadro e recursos DESTA
--   organização e activos (NG008); só então o negócio aberto da mesma pessoa
--   com pessoas.edit e âmbito, bloqueado (NG001); por fim o bloqueio
--   consultivo por recurso e o conflito de agenda (NG010). O resto (permissão
--   scheduling.items.create, quadro e recursos visíveis, feriados) é
--   verificado pelo rpc_create_schedule_item com o auth.uid() real.
-- LIMITAÇÃO ASSUMIDA: o D1 vive só nas funções (ver 20261223110000).
-- SÓ ACRESCENTA: nenhuma tabela, trigger, política, configuração ou função
--   existente é alterada. Não bloqueia tabelas. As funções do calendário
--   (rpc_create_schedule_item, check_schedule_conflict) são só chamadas; o
--   bloqueio consultivo por recurso só existe dentro desta função.
-- NÃO escreve anew_leads.scheduled_visit_id (D4). Não é idempotente: a UI
--   desactiva o botão durante o pedido.
-- PRECISA DE CÓDIGO: a UI chama esta RPC em vez de criar a visita no
--   protótipo; regenerar os tipos do Supabase.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, extensions;

DO $$
BEGIN
  IF to_regprocedure('public.fn_neg_negocio_editavel(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta 20261223110000 (auxiliares neg); nada feito.';
  END IF;
END;
$$;

CREATE FUNCTION public.neg_guardar_visita(
  p_organization_id uuid,
  p_entity_id uuid,
  p_board_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_titulo text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_local text DEFAULT NULL,
  p_lat numeric DEFAULT NULL,
  p_lng numeric DEFAULT NULL,
  p_recursos uuid[] DEFAULT NULL,
  p_visit_kind text DEFAULT NULL,
  p_negocio_id uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_titulo     text := NULLIF(btrim(p_titulo), '');
  v_notas      text := NULLIF(btrim(p_notas), '');
  v_local      text := NULLIF(btrim(p_local), '');
  v_keys_lead  text[];
  v_keys_cli   text[];
  v_keys_pes   text[];
  v_lead_id    uuid;
  v_client_id  uuid;
  v_neg_id     uuid;
  v_tipo_quadro text;
  v_recursos   uuid[];
  v_conflito   uuid[];
  v_r          uuid;
  v_item       public.schedule_items;
BEGIN
  -- 1. Sessão e actor
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Parâmetros
  IF p_board_id IS NULL OR p_inicio IS NULL OR p_fim IS NULL
     OR p_fim <= p_inicio OR p_fim - p_inicio > interval '1 day' THEN
    RAISE EXCEPTION 'Valor inválido: quadro ou horário da visita (fim depois do início, até 1 dia).'
      USING ERRCODE = 'NG009';
  END IF;
  IF (p_visit_kind IS NOT NULL AND p_visit_kind NOT IN ('levantamento', 'medicao', 'materiais', 'revisita'))
     OR char_length(v_titulo) > 200 OR char_length(v_notas) > 5000 OR char_length(v_local) > 500
     OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180
     OR COALESCE(cardinality(p_recursos), 0) > 20 THEN
    RAISE EXCEPTION 'Valor inválido: tipo, título, notas, local, coordenadas ou recursos da visita.'
      USING ERRCODE = 'NG009';
  END IF;

  -- 2. Organização do utilizador, com pessoas.view e com configuração (D1).
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':'))
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                    WHERE c.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  -- 3 e 4. Pessoa ligada e visível; a visita fica na lead viva mais recente
  --    visível, senão no cliente visível.
  IF p_entity_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.anew_entity_org_links lk
       WHERE lk.entity_id = p_entity_id AND lk.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  IF public.has_anew_permission(v_uid, 'leads.view') THEN
    v_keys_lead := public.crm_scope_keys('leads.view');
    SELECT l.id INTO v_lead_id
    FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
      AND l.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM unnest(v_keys_lead) AS k(scope_key)
                  WHERE k.scope_key = l.organization_id::text || ':*'
                     OR k.scope_key = l.organization_id::text || ':' || l.assigned_to::text
                     OR k.scope_key = l.organization_id::text || ':' || l.created_by::text)
    ORDER BY l.created_at DESC
    LIMIT 1;
  END IF;

  IF v_lead_id IS NULL AND public.has_anew_permission(v_uid, 'clients.view') THEN
    v_keys_cli := public.crm_scope_keys('clients.view');
    SELECT c.id INTO v_client_id
    FROM public.anew_clients c
    WHERE c.organization_id = p_organization_id AND c.entity_id = p_entity_id
      AND c.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM unnest(v_keys_cli) AS k(scope_key)
                  WHERE k.scope_key = c.organization_id::text || ':*'
                     OR k.scope_key = c.organization_id::text || ':' || c.assigned_to::text
                     OR k.scope_key = c.organization_id::text || ':' || c.created_by::text)
    ORDER BY c.created_at ASC
    LIMIT 1;
  END IF;

  IF v_lead_id IS NULL AND v_client_id IS NULL THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 5. Quadro e recursos DESTA organização, antes de bloquear o negócio ou
  --    de ler ocupação. Quadro: existe nesta organização e não é de ausências.
  --    "Não existe" e "é de outra organização" dão a mesma mensagem.
  SELECT b.board_type INTO v_tipo_quadro
  FROM public.schedule_boards b
  WHERE b.id = p_board_id AND b.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quadro ou recurso indisponível.' USING ERRCODE = 'NG008';
  END IF;
  IF v_tipo_quadro = 'time_off' THEN
    RAISE EXCEPTION 'Valor inválido: o quadro de ausências não serve para visitas.' USING ERRCODE = 'NG009';
  END IF;

  --    Recursos: sem recursos, o rpc usa o recurso activo do criador nesta
  --    organização; verifica-se esse (se ainda não existir, o rpc cria-o e não
  --    há conflito).
  v_recursos := (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_recursos) AS u(x) WHERE x IS NOT NULL);
  IF v_recursos IS NULL THEN
    v_conflito := ARRAY(
      SELECT r.id FROM public.schedule_resources r
      WHERE r.user_id = v_actor AND r.organization_id = p_organization_id AND r.is_active = true
      ORDER BY r.created_at ASC
      LIMIT 1);
  ELSE
    -- Cada recurso pedido existe, está activo e é desta organização (antes
    -- de qualquer bloqueio ou leitura de ocupação: sem oráculo de recursos
    -- alheios).
    IF (SELECT count(*) FROM public.schedule_resources r
        WHERE r.id = ANY (v_recursos) AND r.organization_id = p_organization_id
          AND r.is_active = true) <> cardinality(v_recursos) THEN
      RAISE EXCEPTION 'Quadro ou recurso indisponível.' USING ERRCODE = 'NG008';
    END IF;
    v_conflito := v_recursos;
  END IF;

  -- 6. Negócio: aberto, da mesma organização e pessoa, com pessoas.edit e
  --    âmbito (cópia do teste de negocios_update). Só se bloqueia a linha
  --    que passa em tudo.
  IF p_negocio_id IS NOT NULL THEN
    IF public.has_anew_permission(v_uid, 'pessoas.edit') THEN
      SELECT n.id INTO v_neg_id
      FROM public.negocios n
      WHERE n.id = p_negocio_id
        AND n.organization_id = p_organization_id
        AND n.entity_id = p_entity_id
        AND n.estado = 'aberto'
        AND n.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                    WHERE k.scope_key = n.organization_id::text || ':*'
                       OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                       OR k.scope_key = n.organization_id::text || ':' || n.created_by::text)
      FOR NO KEY UPDATE;
    END IF;
    IF v_neg_id IS NULL THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
  END IF;

  -- 7. Conflitos, por ordem de uuid, com bloqueio consultivo por recurso.
  FOREACH v_r IN ARRAY COALESCE(v_conflito, ARRAY[]::uuid[]) LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('agenda:' || v_r::text, 0));
    IF public.check_schedule_conflict(v_r, p_inicio, p_fim, NULL::uuid) THEN
      RAISE EXCEPTION 'O recurso já tem outra marcação nesse horário.' USING ERRCODE = 'NG010';
    END IF;
  END LOOP;

  -- 8. Criar pela função do calendário (verificações dela com o auth.uid() real).
  SELECT si.* INTO v_item
  FROM public.rpc_create_schedule_item(
    p_organization_id      => p_organization_id,
    p_board_id             => p_board_id,
    p_title                => COALESCE(v_titulo, 'Visita'),
    p_description          => v_notas,
    p_status               => 'scheduled'::public.schedule_item_status,
    p_origin               => 'manual'::public.schedule_item_origin,
    p_start_datetime       => p_inicio,
    p_end_datetime         => p_fim,
    p_all_day              => false,
    p_client_id            => v_client_id,
    p_location             => v_local,
    p_location_lat         => p_lat,
    p_location_lng         => p_lng,
    p_assignee_resource_ids => v_recursos,
    p_lead_id              => v_lead_id) AS si;

  -- 9. O resto do INSERT, auditado (o rpc deixou a auditoria genérica desligada).
  PERFORM set_config('app.audit_bypass', 'off', true);
  IF p_visit_kind IS NOT NULL OR v_neg_id IS NOT NULL THEN
    UPDATE public.schedule_items s
    SET visit_kind = p_visit_kind, negocio_id = v_neg_id
    WHERE s.id = v_item.id;
  END IF;

  RETURN jsonb_build_object('visita_id', v_item.id, 'mudou', true, 'ligado_a', v_neg_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_guardar_visita(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, numeric, numeric, uuid[], text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_guardar_visita(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, numeric, numeric, uuid[], text, uuid) TO authenticated, service_role;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. função nova: DEFINER, search_path fixo, sem anon, com authenticated
  v_txt := (SELECT count(*)
            FROM pg_proc p
            WHERE p.oid = to_regprocedure('public.neg_guardar_visita(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text,numeric,numeric,uuid[],text,uuid)')
              AND p.prosecdef
              AND array_to_string(p.proconfig, ',') = 'search_path=public, pg_temp'
              AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
              AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text;
  IF v_txt IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'CONFERIR (1. neg_guardar_visita): obtido %, esperado 1', v_txt;
  END IF;

  -- 2. funções existentes chamadas, iguais (md5 lidos a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.current_business_user_id()',     '7e60101f074e4ff526559140be6618bb'),
              ('public.crm_scope_keys(text)',           '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)', '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',     '29782031244dd3b0842ca43b271e2bf1'),
              ('public.check_schedule_conflict(uuid,timestamp with time zone,timestamp with time zone,uuid)', '0cef32398d3cea80b0853cf69a548657'),
              ('public.rpc_create_schedule_item(uuid,uuid,text,text,schedule_item_status,schedule_item_origin,timestamp with time zone,timestamp with time zone,boolean,uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,text,integer,text[],text,jsonb,text,text,uuid[],uuid)', 'f2bd379b10a1fa019bf4b3e23b34ada9')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2. funções existentes mudaram): %', v_txt;
  END IF;

  -- 3. tabelas usadas existem
  v_txt := (SELECT string_agg(t, ',') FROM unnest(ARRAY[
              'negocios', 'negocio_workflow_config', 'schedule_items', 'schedule_boards',
              'schedule_resources', 'anew_leads', 'anew_clients', 'anew_entity_org_links']) AS t
            WHERE to_regclass('public.' || t) IS NULL);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (3. tabelas em falta): %', v_txt;
  END IF;
END;
$$;

COMMIT;
