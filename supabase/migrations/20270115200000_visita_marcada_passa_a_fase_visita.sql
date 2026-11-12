-- ============================================================
-- 20270115200000 visita_marcada_passa_a_fase_visita
-- ============================================================
-- Problema (12/11, negócio 1041, c0bfecf3-…): a visita foi marcada (schedule_items com negocio_id, por neg_guardar_visita) mas o negócio
--   ficou em Contacto (fase 1), sem vaga. neg_guardar_visita cria a visita e muda o responsável (fn_neg_responsavel_pela_visita), mas a
--   fase e a vaga ficavam a cargo do ecrã (motor.ts A.marcarVisita: d.visita.slot e fase(d, 2), gravados depois por neg_guardar_negocio);
--   quando o portão do Contacto falha o ecrã não grava, e o negócio fica em Contacto com a visita na agenda.
-- Correção: neg_guardar_visita, na mesma transação, quando a visita é de um negócio aberto (não apagado, não anulado, fase dada pelo ecrã:
--   fn_neg_fase_minima = 0) em Por contactar/Contacto (fase <= 1) e não é uma revisita: negocios.fase = 2, negocio_medidas.slot com a
--   vaga («qui 12/11 · 10:00», hora de Lisboa: o formato de vagaDoMotor/slotDe) e «Visita marcada para <vaga>» no histórico (tipo 'a',
--   à frente, como fn_neg_responsavel_pela_visita). Devolve a vaga em 'passou_a_visita' (null quando não mudou a fase).
--   Permissões: as mesmas do passo (negocios.visita.gerir e o negócio no âmbito, como hoje); de Por contactar (0) pede também
--   negocios.contacto.registar, como a passagem 0 -> 2 em neg_guardar_negocio. Nada se enfraquece.
-- neg_guardar_negocio não muda: com a fase 2 já na base, a gravação seguinte do ecrã com fase 2 não é uma passagem de fase (fase igual);
--   o portão da fase (v_fb = 2) aceita negocios.visita.gerir ou .preencher, como na Visita.
-- Acerto de dados: negócios abertos em fase <= 1 com uma visita por fazer (status 'scheduled', não revisita) passam à Visita, com a vaga
--   da visita mais próxima de agora e a linha no histórico (à data em que a visita foi criada).
-- Corpo de neg_guardar_visita a partir do pg_get_functiondef VIVO (12/11/2026, guarda md5). Nova função interna fn_neg_vaga_da_visita.
-- Sem tabelas nem colunas novas.
-- Reversão (só como migration nova): repor o corpo da 20270114310000 (sem o bloco 20270115200000); DROP de fn_neg_vaga_da_visita.
--   O acerto de dados não se desfaz.
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF md5(pg_get_functiondef('public.neg_guardar_visita(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text,numeric,numeric,uuid[],text,uuid,jsonb)'::regprocedure)) <> 'f682bcc63deaf716b392522f94eef58c' THEN
    RAISE EXCEPTION 'neg_guardar_visita mudou desde a leitura (12/11/2026); rever antes de aplicar';
  END IF;
END $g$;

-- ---- 1. a vaga no formato do ecrã («qui 12/11 · 10:00»: dia da semana abreviado, dd/mm · HH:MI, hora de Lisboa)
CREATE OR REPLACE FUNCTION public.fn_neg_vaga_da_visita(p_inicio timestamp with time zone)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN p_inicio IS NULL THEN NULL ELSE
    (ARRAY['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'])[extract(dow FROM p_inicio AT TIME ZONE 'Europe/Lisbon')::int + 1]
    || ' ' || to_char(p_inicio AT TIME ZONE 'Europe/Lisbon', 'DD/MM') || ' · ' || to_char(p_inicio AT TIME ZONE 'Europe/Lisbon', 'HH24:MI')
  END;
$$;
REVOKE ALL ON FUNCTION public.fn_neg_vaga_da_visita(timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_vaga_da_visita(timestamp with time zone) TO service_role;

-- ---- 2. marcar a visita (neg_guardar_visita): a primeira visita passa o negócio à Visita
CREATE OR REPLACE FUNCTION public.neg_guardar_visita(p_organization_id uuid, p_entity_id uuid, p_board_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_titulo text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_local text DEFAULT NULL::text, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric, p_recursos uuid[] DEFAULT NULL::uuid[], p_visit_kind text DEFAULT NULL::text, p_negocio_id uuid DEFAULT NULL::uuid, p_detalhes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_titulo     text := NULLIF(btrim(p_titulo), '');
  v_notas      text := NULLIF(btrim(p_notas), '');
  v_local      text := NULLIF(btrim(p_local), '');
  v_det        jsonb;
  v_keys_pes   text[];
  v_neg_id     uuid;
  v_tipo_quadro text;
  v_recursos   uuid[];
  v_conflito   uuid[];
  v_r          uuid;
  v_item       public.schedule_items;
  v_papel      boolean; -- 20270105700000
  v_resp       jsonb;   -- 20270114310000
  v_fase_antes smallint; -- 20270115200000
  v_vaga       text;     -- 20270115200000
  v_ordem      integer;  -- 20270115200000
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
  v_det := public.fn_neg_detalhes_visita(p_detalhes);
  -- 20270105700000: a visita de um negócio onde o Papel no Negócio da pessoa conta (fn_neg_papel_conta: pessoas.edit pelo papel,
  --   membro da organização do negócio), como neg_guardar_negocio aceita
  v_papel := p_negocio_id IS NOT NULL AND public.fn_neg_papel_conta(p_negocio_id);

  -- 2. Organização do utilizador, com pessoas.view e com configuração (D1).
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT (v_papel OR (public.has_anew_permission(v_uid, 'pessoas.view')
                         AND EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                                     WHERE starts_with(k.scope_key, p_organization_id::text || ':'))))
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                    WHERE c.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  -- 3 e 4. Pessoa: entidade viva desta organização, no âmbito de leitura
  --    (leads.view para leads, clients.view para clientes). 20261228200000:
  --    a visita liga à entidade (schedule_items.entity_id), sem lead nem cliente.
  -- 20270105700000: pelo papel, a pessoa é a do negócio (o passo 6 exige n.entity_id = p_entity_id)
  IF NOT v_papel AND NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'view') THEN
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
    -- 20270105700000: ou pelo Papel no Negócio (o mesmo negócio aberto, organização e pessoa; sem o âmbito da organização)
    IF v_neg_id IS NULL AND v_papel THEN
      SELECT n.id INTO v_neg_id
      FROM public.negocios n
      WHERE n.id = p_negocio_id AND n.organization_id = p_organization_id AND n.entity_id = p_entity_id
        AND n.estado = 'aberto' AND n.deleted_at IS NULL
      FOR NO KEY UPDATE;
    END IF;
    IF v_neg_id IS NULL THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
    -- 20270105200000: a visita de um negócio pede também negocios.visita.gerir
    IF NOT public.fn_cat_pode(p_organization_id, 'negocios.visita.gerir') THEN
      RAISE EXCEPTION 'Sem permissão (negocios.visita.gerir): não pode marcar visitas do negócio.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 7. Conflitos, por ordem de uuid, com bloqueio consultivo por recurso.
  FOREACH v_r IN ARRAY COALESCE(v_conflito, ARRAY[]::uuid[]) LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('agenda:' || v_r::text, 0));
    IF public.check_schedule_conflict(v_r, p_inicio, p_fim, NULL::uuid) THEN
      RAISE EXCEPTION 'O recurso já tem outra marcação nesse horário.'
        USING ERRCODE = 'NG010', DETAIL = v_r::text;
    END IF;
  END LOOP;

  -- 8. Criar pela função do calendário (verificações dela com o auth.uid() real).
  -- 20270105700000: pelo Papel no Negócio sem permissão de agenda, cria-se direto (como fn_neg_sincronizar_visitas), com os recursos
  --   pedidos ou o recurso activo do criador já existente (não se cria recurso novo)
  IF v_papel AND v_neg_id IS NOT NULL AND NOT public.has_anew_permission_for_org(v_uid, 'scheduling.items.create', p_organization_id) THEN
    INSERT INTO public.schedule_items (board_id, title, description, status, origin, start_datetime, end_datetime, all_day,
      entity_id, location, location_lat, location_lng, priority, metadata, created_by, organization_id)
    VALUES (p_board_id, COALESCE(v_titulo, 'Visita'), v_notas, 'scheduled'::public.schedule_item_status, 'manual'::public.schedule_item_origin,
      p_inicio, p_fim, false, p_entity_id, v_local, p_lat, p_lng, 0,
      CASE WHEN v_det IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('pessoas', v_det) END, v_actor, p_organization_id)
    RETURNING * INTO v_item;
    INSERT INTO public.schedule_item_assignees (item_id, resource_id)
    SELECT DISTINCT v_item.id, x FROM unnest(COALESCE(v_conflito, ARRAY[]::uuid[])) AS u(x) WHERE x IS NOT NULL;
  ELSE
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
    p_location             => v_local,
    p_location_lat         => p_lat,
    p_location_lng         => p_lng,
    p_metadata             => CASE WHEN v_det IS NULL THEN NULL
                                   ELSE jsonb_build_object('pessoas', v_det) END,
    p_assignee_resource_ids => v_recursos,
    p_entity_id            => p_entity_id) AS si;
  END IF;

  -- 9. O resto do INSERT, auditado (o rpc deixou a auditoria genérica desligada).
  PERFORM set_config('app.audit_bypass', 'off', true);
  IF p_visit_kind IS NOT NULL OR v_neg_id IS NOT NULL THEN
    UPDATE public.schedule_items s
    SET visit_kind = p_visit_kind, negocio_id = v_neg_id
    WHERE s.id = v_item.id;
  END IF;

  -- 20270115200000: a primeira visita (não uma revisita) de um negócio aberto em Por contactar/Contacto passa-o à Visita (2), na mesma
  --   transação: negocios.fase = 2, a vaga em negocio_medidas.slot (o formato do ecrã, «qui 12/11 · 10:00», hora de Lisboa) e
  --   «Visita marcada para <vaga>» no histórico, como A.marcarVisita. Antes ficava a cargo do ecrã, que não gravava quando o portão do
  --   Contacto falhava (o negócio ficava em Contacto com a visita na agenda). Autorização: a deste passo (negocios.visita.gerir e o
  --   negócio no âmbito, já verificados acima: v_neg_id só existe se passou); de Por contactar (0) pede também negocios.contacto.registar,
  --   como a passagem 0 -> 2 em neg_guardar_negocio. Não mexe numa fase dada pelo servidor (fn_neg_fase_minima > 0) nem num anulado.
  IF v_neg_id IS NOT NULL AND COALESCE(p_visit_kind, 'levantamento') <> 'revisita' AND v_item.time_off_type IS NULL THEN
    SELECT n.fase INTO v_fase_antes
    FROM public.negocios n
    WHERE n.id = v_neg_id AND n.estado = 'aberto' AND n.deleted_at IS NULL AND n.anulado_em IS NULL AND COALESCE(n.fase, 0) <= 1;
    IF FOUND AND public.fn_neg_fase_minima(v_neg_id) = 0
       AND (COALESCE(v_fase_antes, 0) = 1 OR public.fn_cat_pode(p_organization_id, 'negocios.contacto.registar')) THEN
      v_vaga := public.fn_neg_vaga_da_visita(p_inicio);
      UPDATE public.negocios n SET fase = 2 WHERE n.id = v_neg_id;
      INSERT INTO public.negocio_medidas AS m (organization_id, negocio_id, slot)
      VALUES (p_organization_id, v_neg_id, v_vaga)
      ON CONFLICT (negocio_id) DO UPDATE SET slot = EXCLUDED.slot;
      SELECT COALESCE(min(h.ordem), 0) - 1 INTO v_ordem FROM public.negocio_historico h WHERE h.negocio_id = v_neg_id;
      INSERT INTO public.negocio_historico (organization_id, negocio_id, ordem, ocorrido_em, texto, tipo)
      VALUES (p_organization_id, v_neg_id, v_ordem, now(), 'Visita marcada para ' || v_vaga, 'a');
    END IF;
  END IF;

  -- 20270114310000: a visita de um negócio com um comercial (ou, sem comercial, um recurso com conta) passa-lhe a lead e o negócio,
  --   na mesma transação (fn_neg_responsavel_pela_visita). A autorização é a deste passo (negocios.visita.gerir e o negócio no âmbito);
  --   não pede leads.assign a quem marca: a assistente comercial marca a visita para o comercial e o negócio segue-o.
  IF v_neg_id IS NOT NULL THEN
    v_resp := public.fn_neg_responsavel_pela_visita(v_neg_id, v_item.id, COALESCE(p_recursos, v_conflito));
  END IF;

  RETURN jsonb_build_object('visita_id', v_item.id, 'mudou', true, 'ligado_a', v_neg_id, 'responsavel', v_resp,
                            'passou_a_visita', v_vaga); -- 20270115200000: a vaga, se o negócio passou à Visita; senão null
END;
$function$
;

-- ---- 3. acerto de dados: negócios em Por contactar/Contacto com uma visita por fazer
DO $a$
DECLARE r record; v_vaga text; v_ordem integer; v_n integer := 0;
BEGIN
  FOR r IN
    SELECT n.id, n.organization_id, v.start_datetime, v.created_at
    FROM public.negocios n
    CROSS JOIN LATERAL (
      SELECT s.start_datetime, s.created_at FROM public.schedule_items s
      WHERE s.negocio_id = n.id AND s.organization_id = n.organization_id AND s.status = 'scheduled'::public.schedule_item_status
        AND s.time_off_type IS NULL AND COALESCE(s.visit_kind, 'levantamento') <> 'revisita'
      ORDER BY abs(extract(epoch FROM s.start_datetime - now())), s.start_datetime
      LIMIT 1) v
    WHERE n.estado = 'aberto' AND n.deleted_at IS NULL AND n.anulado_em IS NULL AND COALESCE(n.fase, 0) <= 1
      AND public.fn_neg_fase_minima(n.id) = 0
    ORDER BY n.id
    FOR NO KEY UPDATE OF n
  LOOP
    v_vaga := public.fn_neg_vaga_da_visita(r.start_datetime);
    UPDATE public.negocios n SET fase = 2 WHERE n.id = r.id;
    INSERT INTO public.negocio_medidas AS m (organization_id, negocio_id, slot)
    VALUES (r.organization_id, r.id, v_vaga)
    ON CONFLICT (negocio_id) DO UPDATE SET slot = EXCLUDED.slot;
    SELECT COALESCE(min(h.ordem), 0) - 1 INTO v_ordem FROM public.negocio_historico h WHERE h.negocio_id = r.id;
    INSERT INTO public.negocio_historico (organization_id, negocio_id, ordem, ocorrido_em, texto, tipo)
    VALUES (r.organization_id, r.id, v_ordem, COALESCE(r.created_at, now()), 'Visita marcada para ' || v_vaga, 'a');
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'acerto 20270115200000: % negócio(s) passaram à Visita', v_n;
END $a$;

-- ---- 4. conferir
DO $c$ BEGIN
  IF position('20270115200000' IN pg_get_functiondef('public.neg_guardar_visita(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text,numeric,numeric,uuid[],text,uuid,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: neg_guardar_visita sem o bloco 20270115200000';
  END IF;
  IF public.fn_neg_vaga_da_visita('2026-11-12 08:00:00+00') <> 'qui 12/11 · 08:00'
     OR public.fn_neg_vaga_da_visita('2026-07-15 09:30:00+00') <> 'qua 15/07 · 10:30' THEN
    RAISE EXCEPTION 'CONFERIR: fn_neg_vaga_da_visita fora do formato do ecrã';
  END IF;
END $c$;
