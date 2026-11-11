-- ============================================================
-- 20270114310000 visita_passa_ao_comercial
-- ============================================================
-- Problema (11/11, negócio 1042 «teste 5»): a assistente comercial faz o Contacto e marca a visita com o comercial como recurso. A visita
--   fica com o comercial, mas a lead (anew_entities.assigned_to) e o negócio (negocios.assigned_to) ficam com a assistente. O comercial,
--   com pessoas.edit «só os seus», não cria o orçamento: fn_neg_validar_documento -> fn_neg_pode_editar exige o negócio atribuído ou
--   criado por ele («Sem permissão para criar documentos neste negócio.»).
-- Porque a sincronização existente não chegou: (1) neg_guardar_visita cria a visita por rpc_create_schedule_item, que (por desenho da
--   20261204720000) nunca muda o dono da lead: só rpc_update_schedule_item_assignees / rpc_reassign_visit chamam
--   fn_owner_sync_entity_from_visit, e essas só correm ao TROCAR os recursos de uma visita que já existe (neg_alterar_visita);
--   (2) nenhuma função muda negocios.assigned_to: fn_owner_sync_* e neg_atribuir_pessoa só mexem na pessoa, e fn_negocios_dono_para_pessoa
--   vai no sentido contrário (negócio -> pessoa, e só se a pessoa não tiver dono). O negócio ficava sempre com quem o criou.
-- Correção: fn_neg_responsavel_pela_visita, chamada por neg_guardar_visita (marcar) e neg_alterar_visita (remarcar com outros recursos),
--   na mesma transação da visita:
--   - escolhe o primeiro recurso que é um comercial (ficha RH com o papel «comercial», a ligação de neg_papeis_dos_recursos); sem
--     comercial, o primeiro recurso «user»; sem recurso «user», não mexe. Um negócio que já está com um comercial não passa para um
--     recurso que não é comercial (um técnico numa revisita não o tira ao comercial);
--   - só visitas futuras, por fazer, de negócios abertos até à fase da Visita (2). Cancelar não desfaz nada; negócios com a visita no
--     passado ficam como estão (sem backfill);
--   - a lead (não um cliente) passa para ele com as regras de neg_atribuir_pessoa (membro activo, não cliente; as outras visitas futuras
--     da pessoa seguem-no por fn_owner_sync_apply; auditoria genérica de anew_entities ligada);
--   - o negócio passa para ele (o gatilho de leads.assign só olha a escritas diretas do PostgREST);
--   - fica no histórico do negócio «Responsável: <nome> (visita marcada)».
-- Decisão (pedida pelo utilizador): quem marca a visita tem de ter negocios.visita.gerir e o negócio no âmbito, como hoje; a reatribuição
--   faz parte desse passo e NÃO pede leads.assign à assistente.
-- Sem tabelas nem colunas novas. fn_neg_e_comercial interna; fn_neg_responsavel_pela_visita com EXECUTE para authenticated (neg_alterar_visita é INVOKER) e que revalida quem chama. neg_guardar_visita e neg_alterar_visita a partir
--   do texto VIVO (11/11/2026, guarda md5): só se junta a chamada e a chave 'responsavel' no jsonb devolvido.
-- Reversão (só como migration nova): repor os dois corpos sem a chamada; DROP das duas funções novas.
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF md5(pg_get_functiondef('public.neg_guardar_visita(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text,numeric,numeric,uuid[],text,uuid,jsonb)'::regprocedure)) <> '607fe4b322fbc54a425aea4f046a79ab' THEN
    RAISE EXCEPTION 'neg_guardar_visita mudou desde a leitura (11/11/2026); rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.neg_alterar_visita(uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text,uuid[],text,jsonb)'::regprocedure)) <> '40faba11766fa749268e61f55da09bdb' THEN
    RAISE EXCEPTION 'neg_alterar_visita mudou desde a leitura (11/11/2026); rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.fn_owner_sync_apply(text,uuid,uuid,uuid,uuid,uuid)'::regprocedure)) <> 'e23c4e1dc32de02e487bdce49e865696' THEN
    RAISE EXCEPTION 'fn_owner_sync_apply mudou desde a leitura (11/11/2026); rever antes de aplicar';
  END IF;
END $g$;

-- ---- 1. a pessoa com esta conta tem a ficha RH com o papel «comercial» nesta organização (a mesma ligação de neg_papeis_dos_recursos)
CREATE OR REPLACE FUNCTION public.fn_neg_e_comercial(p_org uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_org IS NOT NULL AND p_user IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.pessoas_contas pc
    JOIN public.pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
    JOIN public.pessoas_papeis_negocio pp ON pp.pessoa_id = pc.pessoa_id AND pp.organization_id = p_org AND pp.papel = 'comercial'
    WHERE pc.anew_user_id = p_user AND pc.organization_id = p_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL);
$$;
REVOKE ALL ON FUNCTION public.fn_neg_e_comercial(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_e_comercial(uuid, uuid) TO service_role;

-- ---- 2. a visita marcada passa a lead e o negócio para o comercial dela
-- Chamada de dentro de neg_guardar_visita (DEFINER) e neg_alterar_visita (INVOKER: por isso tem EXECUTE para authenticated), depois de
-- estas validarem quem marca. Volta a validar aqui o mesmo (sessão, negocios.visita.gerir e o negócio no âmbito de pessoas.edit ou pelo
-- Papel no Negócio): chamada à parte não dá mais do que marcar a visita já dá, e só atribui a quem é recurso da própria visita.
-- Devolve NULL quando não muda nada.
CREATE OR REPLACE FUNCTION public.fn_neg_responsavel_pela_visita(p_negocio_id uuid, p_visita_id uuid, p_recursos uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_neg       public.negocios;
  v_vis       public.schedule_items;
  v_novo      uuid;
  v_e_com     boolean;
  v_ent_dono  uuid;
  v_cliente   boolean;
  v_lead      boolean := false;
  v_negocio   boolean := false;
  v_outras    uuid[];
  v_nome      text;
  v_ordem     integer;
BEGIN
  IF p_negocio_id IS NULL OR p_visita_id IS NULL OR COALESCE(cardinality(p_recursos), 0) = 0 THEN
    RETURN NULL;
  END IF;

  -- o negócio aberto, vivo, até à fase da Visita (as revisitas do Negócio e da Obra não mudam o responsável)
  SELECT * INTO v_neg FROM public.negocios n
  WHERE n.id = p_negocio_id AND n.deleted_at IS NULL AND n.estado = 'aberto' AND COALESCE(n.fase, 0) <= 2
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF auth.uid() IS NULL OR NOT public.fn_cat_pode(v_neg.organization_id, 'negocios.visita.gerir')
     OR NOT (public.fn_neg_no_ambito(v_neg, 'pessoas.edit') OR public.fn_neg_papel_conta(v_neg.id)) THEN
    RETURN NULL;
  END IF;

  -- a visita deste negócio, futura e por fazer (como fn_owner_sync_future_visits)
  SELECT * INTO v_vis FROM public.schedule_items s
  WHERE s.id = p_visita_id AND s.negocio_id = v_neg.id AND s.organization_id = v_neg.organization_id;
  IF NOT FOUND OR v_vis.start_datetime <= now()
     OR v_vis.status IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)
     OR v_vis.time_off_type IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- o primeiro recurso que é um comercial; sem comercial, o primeiro recurso «user». Só recursos que estão na visita, activos, desta
  -- organização, de um membro activo que não é cliente (a regra de neg_atribuir_pessoa).
  SELECT x.user_id, x.comercial INTO v_novo, v_e_com
  FROM (
    SELECT r.user_id, u.ord, public.fn_neg_e_comercial(v_neg.organization_id, r.user_id) AS comercial
    FROM unnest(p_recursos) WITH ORDINALITY AS u(id, ord)
    JOIN public.schedule_resources r ON r.id = u.id
    WHERE u.id IS NOT NULL
      AND r.organization_id = v_neg.organization_id AND r.resource_type = 'user' AND r.user_id IS NOT NULL AND r.is_active IS NOT FALSE
      AND EXISTS (SELECT 1 FROM public.schedule_item_assignees a WHERE a.item_id = v_vis.id AND a.resource_id = r.id)
      AND EXISTS (SELECT 1 FROM public.anew_memberships m
                  WHERE m.user_id = r.user_id AND m.organization_id = v_neg.organization_id
                    AND m.status = 'active' AND m.role_is_client IS NOT TRUE)
  ) x
  ORDER BY x.comercial DESC, x.ord
  LIMIT 1;
  IF v_novo IS NULL THEN
    RETURN NULL;
  END IF;
  -- sem comercial na visita, um negócio que já está com um comercial fica com ele (um técnico numa revisita não o tira ao comercial)
  IF NOT v_e_com AND public.fn_neg_e_comercial(v_neg.organization_id, v_neg.assigned_to) THEN
    RETURN NULL;
  END IF;

  -- a lead (uma pessoa que já é cliente fica com o responsável que tem): como neg_atribuir_pessoa, e as outras visitas futuras dela
  -- passam para o recurso do novo responsável (fn_owner_sync_apply, sem tocar nesta)
  SELECT e.assigned_to, e.client_since IS NOT NULL INTO v_ent_dono, v_cliente
  FROM public.anew_entities e
  WHERE e.id = v_neg.entity_id AND e.organization_id = v_neg.organization_id AND e.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF FOUND AND NOT v_cliente AND v_ent_dono IS DISTINCT FROM v_novo THEN
    UPDATE public.anew_entities e SET assigned_to = v_novo, updated_at = now() WHERE e.id = v_neg.entity_id;
    v_outras := public.fn_owner_sync_apply('entity', v_neg.entity_id, v_neg.organization_id, v_ent_dono, v_novo, v_vis.id);
    v_lead := true;
  END IF;

  -- o negócio (o gatilho de leads.assign só olha a escritas diretas; esta é a da visita)
  IF v_neg.assigned_to IS DISTINCT FROM v_novo THEN
    UPDATE public.negocios n SET assigned_to = v_novo WHERE n.id = v_neg.id;
    v_negocio := true;
  END IF;

  IF NOT (v_lead OR v_negocio) THEN
    RETURN NULL;
  END IF;

  -- no histórico do negócio, à frente (ordem mais baixa); o ecrã junta a mesma linha antes da gravação seguinte
  SELECT COALESCE(NULLIF(btrim(u.name), ''), u.email) INTO v_nome FROM public.anew_users u WHERE u.id = v_novo;
  SELECT COALESCE(min(h.ordem), 0) - 1 INTO v_ordem FROM public.negocio_historico h WHERE h.negocio_id = v_neg.id;
  INSERT INTO public.negocio_historico (organization_id, negocio_id, ordem, ocorrido_em, texto, tipo)
  VALUES (v_neg.organization_id, v_neg.id, v_ordem, now(), 'Responsável: ' || COALESCE(v_nome, 'comercial') || ' (visita marcada)', 'a');

  RETURN jsonb_build_object('user_id', v_novo, 'nome', v_nome, 'lead_mudou', v_lead, 'negocio_mudou', v_negocio,
                            'outras_visitas', to_jsonb(COALESCE(v_outras, ARRAY[]::uuid[])));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_neg_responsavel_pela_visita(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_responsavel_pela_visita(uuid, uuid, uuid[]) TO authenticated, service_role;


-- ---- 3. marcar a visita (neg_guardar_visita)
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

  -- 20270114310000: a visita de um negócio com um comercial (ou, sem comercial, um recurso com conta) passa-lhe a lead e o negócio,
  --   na mesma transação (fn_neg_responsavel_pela_visita). A autorização é a deste passo (negocios.visita.gerir e o negócio no âmbito);
  --   não pede leads.assign a quem marca: a assistente comercial marca a visita para o comercial e o negócio segue-o.
  IF v_neg_id IS NOT NULL THEN
    v_resp := public.fn_neg_responsavel_pela_visita(v_neg_id, v_item.id, COALESCE(p_recursos, v_conflito));
  END IF;

  RETURN jsonb_build_object('visita_id', v_item.id, 'mudou', true, 'ligado_a', v_neg_id, 'responsavel', v_resp);
END;
$function$
;

-- ---- 4. remarcar a visita (neg_alterar_visita)
CREATE OR REPLACE FUNCTION public.neg_alterar_visita(p_visita_id uuid, p_board_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_titulo text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_local text DEFAULT NULL::text, p_recursos uuid[] DEFAULT NULL::uuid[], p_visit_kind text DEFAULT NULL::text, p_detalhes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vis        public.schedule_items;
  v_titulo     text := NULLIF(btrim(p_titulo), '');
  v_notas      text := NULLIF(btrim(p_notas), '');
  v_local      text := NULLIF(btrim(p_local), '');
  v_tipo       text;
  v_ativo      boolean;
  v_det        jsonb;
  v_meta       jsonb;
  v_atuais     uuid[];
  v_recursos   uuid[];
  v_r          uuid;
  v_m_quadro   boolean;
  v_m_titulo   boolean;
  v_m_notas    boolean;
  v_m_local    boolean;
  v_m_horas    boolean;
  v_m_meta     boolean;
  v_m_tipo     boolean;
  v_m_recursos boolean;
  v_dono       jsonb;
  v_n          int;
  v_direto     boolean; -- 20270105700000
  v_resp       jsonb;   -- 20270114310000
BEGIN
  -- 20270105700000: quem só tem o Papel no Negócio entra pelo invólucro DEFINER
  IF coalesce(current_setting('app.neg_via_papel', true), '') <> 'on' AND public.fn_neg_visita_so_papel(p_visita_id) THEN
    RETURN public.fn_neg_papel_alterar_visita(p_visita_id, p_board_id, p_inicio, p_fim, p_titulo, p_notas, p_local, p_recursos, p_visit_kind, p_detalhes);
  END IF;

  -- 1. Visita: configuração, existência, permissão, estado.
  v_vis := public.fn_neg_visita_editavel(p_visita_id, false);

  -- 2. Quadro e recursos da organização e activos (NG008); quadro de
  --    ausências ou de frota não serve (NG009).
  SELECT b.board_type, b.is_active INTO v_tipo, v_ativo
  FROM public.schedule_boards b
  WHERE b.id = p_board_id AND b.organization_id = v_vis.organization_id;
  IF NOT FOUND OR v_ativo IS FALSE THEN
    RAISE EXCEPTION 'Quadro ou recurso indisponível.' USING ERRCODE = 'NG008';
  END IF;
  IF v_tipo IN ('time_off', 'fleet') THEN
    RAISE EXCEPTION 'Valor inválido: este quadro não serve para visitas.' USING ERRCODE = 'NG009';
  END IF;

  v_atuais := (SELECT COALESCE(array_agg(a.resource_id ORDER BY a.resource_id), ARRAY[]::uuid[])
               FROM public.schedule_item_assignees a WHERE a.item_id = v_vis.id);
  IF p_recursos IS NULL THEN
    v_recursos := v_atuais;
  ELSE
    IF cardinality(p_recursos) = 0 OR cardinality(p_recursos) > 20
       OR array_position(p_recursos, NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'Valor inválido: recursos (1 a 20, sem vazios).' USING ERRCODE = 'NG009';
    END IF;
    v_recursos := (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_recursos) AS u(x));
    IF (SELECT count(*) FROM public.schedule_resources r
        WHERE r.id = ANY (v_recursos) AND r.organization_id = v_vis.organization_id
          AND r.is_active = true) <> cardinality(v_recursos) THEN
      RAISE EXCEPTION 'Quadro ou recurso indisponível.' USING ERRCODE = 'NG008';
    END IF;
  END IF;

  -- 3. Valores.
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim <= p_inicio OR p_fim - p_inicio > interval '1 day' THEN
    RAISE EXCEPTION 'Valor inválido: horário da visita (fim depois do início, até 1 dia).' USING ERRCODE = 'NG009';
  END IF;
  IF (p_visit_kind IS NOT NULL AND p_visit_kind NOT IN ('levantamento', 'medicao', 'materiais', 'revisita'))
     OR char_length(v_titulo) > 200 OR char_length(v_notas) > 5000 OR char_length(v_local) > 500 THEN
    RAISE EXCEPTION 'Valor inválido: tipo, título, notas ou local da visita.' USING ERRCODE = 'NG009';
  END IF;
  v_det := public.fn_neg_detalhes_visita(p_detalhes);

  -- O que muda. Título NULL mantém o actual; notas, local, tipo e detalhes
  -- NULL limpam. O metadata vai inteiro, com a chave 'pessoas' trocada.
  v_titulo := COALESCE(v_titulo, v_vis.title);
  v_meta := (COALESCE(v_vis.metadata, '{}'::jsonb) - 'pessoas')
            || CASE WHEN v_det IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('pessoas', v_det) END;
  v_m_quadro   := p_board_id IS DISTINCT FROM v_vis.board_id;
  v_m_titulo   := v_titulo IS DISTINCT FROM v_vis.title;
  v_m_notas    := v_notas IS DISTINCT FROM v_vis.description;
  v_m_local    := v_local IS DISTINCT FROM v_vis.location;
  v_m_horas    := p_inicio IS DISTINCT FROM v_vis.start_datetime OR p_fim IS DISTINCT FROM v_vis.end_datetime;
  v_m_meta     := v_meta IS DISTINCT FROM COALESCE(v_vis.metadata, '{}'::jsonb);
  v_m_tipo     := p_visit_kind IS DISTINCT FROM v_vis.visit_kind;
  v_m_recursos := p_recursos IS NOT NULL AND v_recursos IS DISTINCT FROM v_atuais;

  IF NOT (v_m_quadro OR v_m_titulo OR v_m_notas OR v_m_local OR v_m_horas OR v_m_meta
          OR v_m_tipo OR v_m_recursos) THEN
    RETURN jsonb_build_object('visita_id', v_vis.id, 'mudou', false, 'recursos_mudaram', false,
                              'dono_alterado', false, 'novo_dono', NULL, 'outras_visitas', '[]'::jsonb,
                              'desconfirmada', false);
  END IF;

  -- 20270105700000: pelo Papel no Negócio, sem permissão de agenda, escreve-se direto (como fn_neg_sincronizar_visitas); os recursos
  --   (e a troca de dono da lead que arrastam) continuam a pedir a permissão da agenda
  v_direto := coalesce(current_setting('app.neg_via_papel', true), '') = 'on' AND v_vis.negocio_id IS NOT NULL AND public.fn_neg_papel_conta(v_vis.negocio_id)
              AND NOT public.has_anew_permission_for_org(auth.uid(), 'scheduling.items.edit', v_vis.organization_id);
  IF v_direto AND v_m_recursos THEN
    RAISE EXCEPTION 'Sem permissão para alterar os recursos desta visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3b. Trocar os recursos de uma visita futura pode mudar o dono da lead ou
  --     do cliente (fn_owner_sync_entity_from_visit, DEFINER). Exige poder
  --     editar essa lead (leads.edit, pelo auxiliar DEFINER) e esse cliente
  --     (clients.edit: a leitura FOR NO KEY UPDATE aplica a política de UPDATE).
  IF v_m_recursos AND p_inicio > now() THEN
    -- A lead é resolvida como fn_owner_sync_entity_from_visit a resolve
    -- (lead_id, metadata.lead_id, scheduled_visit_id), também a que o
    -- chamador não vê: auxiliar DEFINER que só devolve boolean. Falha
    -- fechada, mensagem genérica.
    IF NOT public.fn_neg_pode_mudar_dono_lead(v_vis.id) THEN
      RAISE EXCEPTION 'Sem permissão para alterar os recursos desta visita.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- 20261228200000: a visita liga à entidade; a verificação do
    -- responsável (lead ou cliente) faz-se em fn_neg_pode_mudar_dono_lead.
  END IF;

  -- 4. Conflitos, por ordem de uuid, com bloqueio consultivo por recurso
  --    (exclui a própria visita).
  IF v_m_horas OR v_m_recursos THEN
    FOREACH v_r IN ARRAY v_recursos LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('agenda:' || v_r::text, 0));
      IF public.check_schedule_conflict(v_r, p_inicio, p_fim, v_vis.id) THEN
        RAISE EXCEPTION 'O recurso já tem outra marcação nesse horário.'
          USING ERRCODE = 'NG010', DETAIL = v_r::text;
      END IF;
    END LOOP;
  END IF;

  -- 5. Escritas: a visita pelo rpc do calendário (horas antes dos recursos,
  --    porque a troca de dono olha para a data já gravada).
  IF (v_m_quadro OR v_m_titulo OR v_m_notas OR v_m_local OR v_m_horas OR v_m_meta) AND v_direto THEN
    UPDATE public.schedule_items SET board_id = p_board_id, title = v_titulo, description = v_notas, location = v_local,
      start_datetime = p_inicio, end_datetime = p_fim, metadata = v_meta, updated_at = now()
    WHERE id = v_vis.id;
  ELSIF v_m_quadro OR v_m_titulo OR v_m_notas OR v_m_local OR v_m_horas OR v_m_meta THEN
    PERFORM public.rpc_update_schedule_item(
      p_id                 => v_vis.id,
      p_board_id           => p_board_id,     p_set_board_id       => v_m_quadro,
      p_title              => v_titulo,       p_set_title          => v_m_titulo,
      p_description        => v_notas,        p_set_description    => v_m_notas,
      p_location           => v_local,        p_set_location       => v_m_local,
      p_start_datetime     => p_inicio,       p_set_start_datetime => v_m_horas,
      p_end_datetime       => p_fim,          p_set_end_datetime   => v_m_horas,
      p_metadata           => v_meta,         p_set_metadata       => v_m_meta);
  END IF;

  IF v_m_recursos THEN
    v_dono := public.rpc_update_schedule_item_assignees(v_vis.id, v_recursos);
  END IF;

  -- Os rpc deixam a auditoria genérica desligada: volta a ligar antes da escrita própria.
  PERFORM set_config('app.audit_bypass', 'off', true);

  -- 20270114310000: remarcar a visita de um negócio para outro comercial passa-lhe a lead e o negócio (como em neg_guardar_visita);
  --   só quando os recursos mudam (mudar só as horas não mexe no responsável)
  IF v_m_recursos AND v_vis.negocio_id IS NOT NULL THEN
    v_resp := public.fn_neg_responsavel_pela_visita(v_vis.negocio_id, v_vis.id, p_recursos);
  END IF;

  IF v_m_tipo THEN
    UPDATE public.schedule_items s SET visit_kind = p_visit_kind WHERE s.id = v_vis.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'visita_id', v_vis.id,
    'mudou', true,
    'recursos_mudaram', v_m_recursos,
    'dono_alterado', v_dono IS NOT NULL,
    'novo_dono', v_dono -> 'new_owner',
    'outras_visitas', COALESCE(v_dono -> 'other_visit_ids', '[]'::jsonb),
    'responsavel', v_resp, -- 20270114310000
    -- Mudar as horas de uma visita confirmada passa-a a 'scheduled' (trigger existente).
    'desconfirmada', v_m_horas AND v_vis.status = 'confirmed'::public.schedule_item_status);
END;
$function$
;

RESET lock_timeout;
