-- =============================================================================
-- 20270108260000 — Lote B (P1.4): permissão por organização · frota (fn_fleet_can) e agenda (has_scheduling_permission)
-- =============================================================================
-- Só verificação de permissão: cada has_anew_permission / has_scheduling_permission
-- (globais) passa a has_anew_permission_for_org(uid, código, organização da linha)
-- ou, quando a organização só se conhece depois, a verificação de âmbito usa
-- get_user_permission_org_ids(uid, código) em vez de get_user_visible_org_ids.
-- As verificações globais que já existiam ficam (mesmas mensagens). Nada mais muda.
-- Cada função parte de pg_get_functiondef da versão viva (05/11/2026).
-- Funções: fn_fleet_can, fn_neg_ficha_visitas_recursos, fn_neg_visita_so_papel, neg_alterar_visita, neg_cancelar_visita, neg_guardar_visita, rpc_create_schedule_item, rpc_delete_schedule_item, rpc_reassign_visit, rpc_update_schedule_item, rpc_update_schedule_item_assignees
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_fleet_can(p_organization_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND p_organization_id IS NOT NULL
     AND p_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
     AND public.has_anew_permission_for_org((SELECT auth.uid()), p_permission, p_organization_id)
$function$;

CREATE OR REPLACE FUNCTION public.fn_neg_ficha_visitas_recursos(p_organization_id uuid, p_visitas uuid[])
 RETURNS TABLE(visita_id uuid, recurso_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- A ficha pede no máximo uma página (100) mais uma.
  IF p_organization_id IS NULL OR p_visitas IS NULL OR cardinality(p_visitas) > 101 THEN
    RAISE EXCEPTION 'Valor inválido: visitas.' USING ERRCODE = 'NG009';
  END IF;

  -- Só as visitas que quem chama vê: as três políticas de leitura de
  -- schedule_items, copiadas à letra (a migration confere o md5 delas), com
  -- auth.uid() de quem chama; as funções que usam são todas SECURITY DEFINER,
  -- por isso dão aqui o mesmo que na RLS. Dada a visita visível, as políticas
  -- de leitura de schedule_item_assignees ficam todas satisfeitas: quem vê a
  -- visita vê os seus responsáveis, como hoje. Só os ids; os recursos lêem-se
  -- fora daqui, com a RLS de schedule_resources de quem chama.
  RETURN QUERY
  SELECT a.item_id, a.resource_id
  FROM public.schedule_items si
  JOIN public.schedule_item_assignees a ON a.item_id = si.id
  WHERE si.id = ANY (p_visitas)
    AND si.organization_id = p_organization_id
    AND ((public.is_system_admin(auth.uid())
          AND si.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         OR (public.is_system_admin(auth.uid())
             AND public.has_active_support_access(si.organization_id))
         OR (public.has_anew_permission_for_org(auth.uid(), 'scheduling.items.view', si.organization_id)
             AND si.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
             AND EXISTS (SELECT 1
                         FROM public.get_schedule_item_scope_context(si.organization_id,
                                                                     'scheduling.items.view'::text)
                                AS ctx(applied_scope, owner_ids)
                         WHERE ctx.applied_scope = 'ORG'::text
                            OR si.created_by = ANY (ctx.owner_ids)
                            OR si.user_id = ANY (ctx.owner_ids)
                            OR public.schedule_item_assigned_to_owners(si.id, ctx.owner_ids))));
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_neg_visita_so_papel(p_visita uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM schedule_items s
    WHERE s.id = p_visita AND s.negocio_id IS NOT NULL AND public.fn_neg_papel_conta(s.negocio_id)
      AND NOT (public.has_anew_permission(auth.uid(), 'pessoas.edit')
               AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                           WHERE k.scope_key = s.organization_id::text || ':*'
                              OR k.scope_key = s.organization_id::text || ':' || s.created_by::text
                              OR k.scope_key = s.organization_id::text || ':' || s.user_id::text)
               AND public.has_anew_permission_for_org(auth.uid(), 'scheduling.items.edit', s.organization_id)))
$function$;

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
    -- Mudar as horas de uma visita confirmada passa-a a 'scheduled' (trigger existente).
    'desconfirmada', v_m_horas AND v_vis.status = 'confirmed'::public.schedule_item_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_cancelar_visita(p_visita_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vis public.schedule_items;
BEGIN
  -- 20270105700000: quem só tem o Papel no Negócio entra pelo invólucro DEFINER
  IF coalesce(current_setting('app.neg_via_papel', true), '') <> 'on' AND public.fn_neg_visita_so_papel(p_visita_id) THEN
    RETURN public.fn_neg_papel_cancelar_visita(p_visita_id);
  END IF;

  v_vis := public.fn_neg_visita_editavel(p_visita_id, true);

  IF v_vis.status = 'cancelled'::public.schedule_item_status THEN
    RETURN jsonb_build_object('visita_id', v_vis.id, 'mudou', false);
  END IF;

  -- Nunca DELETE; o levantamento que aponte para esta visita fica como está,
  -- e a pessoa (a entidade) também.
  -- 20270105700000: pelo Papel no Negócio, sem permissão de agenda, escreve-se como fn_neg_sincronizar_visitas (neg_guardar_negocio) faz
  IF coalesce(current_setting('app.neg_via_papel', true), '') = 'on' AND v_vis.negocio_id IS NOT NULL AND public.fn_neg_papel_conta(v_vis.negocio_id)
     AND NOT public.has_anew_permission_for_org(auth.uid(), 'scheduling.items.edit', v_vis.organization_id) THEN
    UPDATE public.schedule_items SET status = 'cancelled'::public.schedule_item_status, updated_at = now() WHERE id = v_vis.id;
  ELSE
  PERFORM public.rpc_update_schedule_item(
    p_id         => v_vis.id,
    p_status     => 'cancelled'::public.schedule_item_status,
    p_set_status => true);
  END IF;
  PERFORM set_config('app.audit_bypass', 'off', true);

  RETURN jsonb_build_object('visita_id', v_vis.id, 'mudou', true);
END;
$function$;

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

  RETURN jsonb_build_object('visita_id', v_item.id, 'mudou', true, 'ligado_a', v_neg_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_schedule_item(p_organization_id uuid, p_board_id uuid, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_status schedule_item_status DEFAULT NULL::schedule_item_status, p_origin schedule_item_origin DEFAULT NULL::schedule_item_origin, p_start_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_all_day boolean DEFAULT NULL::boolean, p_client_id uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid, p_deal_id uuid DEFAULT NULL::uuid, p_employee_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_location text DEFAULT NULL::text, p_location_lat numeric DEFAULT NULL::numeric, p_location_lng numeric DEFAULT NULL::numeric, p_color text DEFAULT NULL::text, p_priority integer DEFAULT NULL::integer, p_tags text[] DEFAULT NULL::text[], p_notes text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb, p_time_off_type text DEFAULT NULL::text, p_approval_status text DEFAULT NULL::text, p_assignee_resource_ids uuid[] DEFAULT NULL::uuid[], p_lead_id uuid DEFAULT NULL::uuid, p_entity_id uuid DEFAULT NULL::uuid)
 RETURNS schedule_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor          uuid;
  v_item           public.schedule_items;
  v_effective_ids  uuid[];
  v_creator_res    uuid;
  v_creator_name   text;
  v_new_res_id     uuid;
  v_resource_diff  jsonb := NULL;
  v_assignee_diff  jsonb := NULL;
  v_audit_org      uuid;
  v_diff           jsonb;
  v_entity         uuid;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ──────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with schedule_items INSERT RLS ───────────────────
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'scheduling.items.create', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para criar agendamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Pessoa da visita (20261228200000): schedule_items.entity_id. p_lead_id
  --    e p_client_id continuam aceites e resolvem-se para a entidade.
  v_entity := public.fn_schedule_items_resolver_entidade(
    p_organization_id, p_entity_id, p_lead_id, p_client_id);

  -- ── INSERT schedule_items (identical column set / defaults to createItem,
  --    com entity_id) ──
  INSERT INTO public.schedule_items
    (board_id, title, description, status, origin,
     start_datetime, end_datetime, all_day,
     entity_id, contact_id, deal_id, employee_id, user_id,
     location, location_lat, location_lng, color, priority,
     tags, notes, metadata, time_off_type, approval_status,
     created_by, organization_id)
  VALUES
    (p_board_id,
     COALESCE(p_title, 'Novo Agendamento'),
     p_description,
     COALESCE(p_status, 'draft'::public.schedule_item_status),
     COALESCE(p_origin, 'manual'::public.schedule_item_origin),
     p_start_datetime,
     p_end_datetime,
     COALESCE(p_all_day, false),
     v_entity,
     p_contact_id,
     p_deal_id,
     p_employee_id,
     p_user_id,
     p_location,
     p_location_lat,
     p_location_lng,
     p_color,
     COALESCE(p_priority, 0),
     p_tags,
     p_notes,
     COALESCE(p_metadata, '{}'::jsonb),
     p_time_off_type,
     p_approval_status,
     v_actor,
     p_organization_id)
  RETURNING * INTO v_item;

  -- ── Resolve effective assignees (mirrors the FE fallback exactly) ─────────
  v_effective_ids := COALESCE(p_assignee_resource_ids, ARRAY[]::uuid[]);

  IF array_length(v_effective_ids, 1) IS NULL THEN
    -- No assignees provided → fall back to the creator's resource.
    SELECT id INTO v_creator_res
    FROM public.schedule_resources
    WHERE user_id = v_actor
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_creator_res IS NULL THEN
      -- Create a schedule_resources row for the creator (same shape as the FE).
      SELECT name INTO v_creator_name
      FROM public.anew_users
      WHERE id = v_actor
      LIMIT 1;

      -- Authorization parity with schedule_resources INSERT RLS. The FE relies on
      -- RLS to allow this insert; replicate the same predicate here.
      IF NOT public.has_anew_permission_for_org(auth.uid(), 'scheduling.resources.create', p_organization_id) THEN
        RAISE EXCEPTION 'Sem permissão para criar recursos de agenda' USING ERRCODE = 'insufficient_privilege';
      END IF;

      INSERT INTO public.schedule_resources
        (name, resource_type, user_id, color, is_active, metadata,
         created_by, organization_id)
      VALUES
        (COALESCE(v_creator_name, 'Utilizador'),
         'user',
         v_actor,
         '#10b981',
         true,
         '{}'::jsonb,
         v_actor,
         p_organization_id)
      RETURNING id INTO v_new_res_id;

      v_creator_res := v_new_res_id;

      -- Record the created resource in the combined diff (it is a real side effect).
      v_resource_diff := jsonb_build_object(
        'id',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_new_res_id)),
        'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(v_creator_name, 'Utilizador'))),
        'resource_type',   jsonb_build_object('old', NULL, 'new', to_jsonb('user'::text)),
        'user_id',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_actor)),
        'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(p_organization_id))
      );
    END IF;

    IF v_creator_res IS NOT NULL THEN
      v_effective_ids := ARRAY[v_creator_res];
    END IF;
  END IF;

  -- ── INSERT assignees (deduped), mirroring the FE ──────────────────────────
  IF array_length(v_effective_ids, 1) IS NOT NULL THEN
    -- Authorization parity with schedule_item_assignees INSERT RLS
    -- (create OR edit permission; item belongs to a visible org — it does, we
    -- just inserted it into p_organization_id which was validated above).
    IF NOT (public.has_anew_permission_for_org(auth.uid(), 'scheduling.items.create', p_organization_id)
            OR public.has_anew_permission_for_org(auth.uid(), 'scheduling.items.edit', p_organization_id)) THEN
      RAISE EXCEPTION 'Sem permissão para atribuir recursos ao agendamento' USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.schedule_item_assignees (item_id, resource_id)
    SELECT v_item.id, x
    FROM (SELECT DISTINCT unnest(v_effective_ids) AS x) d;

    v_assignee_diff := jsonb_build_object(
      'resource_id', jsonb_build_object(
        'old', NULL,
        'new', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_effective_ids) ORDER BY 1))
      )
    );
  END IF;

  -- ── Build combined diff: schedule_items snapshot + side effects ───────────
  v_diff := jsonb_build_object(
    'schedule_items', jsonb_build_object(
      'board_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.board_id)),
      'title',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.title)),
      'status',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.status)),
      'origin',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.origin)),
      'start_datetime',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.start_datetime)),
      'end_datetime',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.end_datetime)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.organization_id))
    )
  );

  IF v_resource_diff IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object('schedule_resources', v_resource_diff);
  END IF;
  IF v_assignee_diff IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object('schedule_item_assignees', v_assignee_diff);
  END IF;

  v_audit_org := COALESCE(v_item.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'schedule_items', v_item.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_item;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_schedule_item(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor      uuid;
  v_before     public.schedule_items;
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.schedule_items WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with schedule_items DELETE RLS ───────────────────
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'scheduling.items.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar agendamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ambito (a5): so pode agir sobre itens dentro do seu ambito -- a MESMA logica
  -- da policy SELECT scoped, mas resolvida pela permissao de ACCAO ('scheduling.items.delete'),
  -- porque view e delete podem ter niveis independentes.
  -- Esta RPC e SECURITY DEFINER e ignora a RLS, por isso o check tem de estar
  -- aqui: sem ele, um OWNED editava/apagava itens de toda a organizacao.
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_schedule_item_scope_context(v_before.organization_id, 'scheduling.items.delete') ctx(applied_scope, owner_ids)
    WHERE ctx.applied_scope = 'ORG'
       OR v_before.created_by = ANY (ctx.owner_ids)
       OR v_before.user_id = ANY (ctx.owner_ids)
       OR public.schedule_item_assigned_to_owners(v_before.id, ctx.owner_ids)
  ) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── DELETE the item (single statement, exactly like the FE) ───────────────
  DELETE FROM public.schedule_items WHERE id = p_id;

  -- ── Combined diff: business-meaningful subset of the removed item ─────────
  -- Same KNOWN DETAIL LOSS as rpc_create_schedule_item: fn_manual_audit_log cannot
  -- populate entity_audit_log.full_record (no parameter for it), so where the old
  -- AFTER trigger stored the full OLD row on DELETE, we store this hand-picked
  -- subset in changed_fields. See the migration summary.
  v_diff := jsonb_build_object(
    'schedule_items', jsonb_build_object(
      'board_id',        jsonb_build_object('old', to_jsonb(v_before.board_id), 'new', NULL),
      'title',           jsonb_build_object('old', to_jsonb(v_before.title), 'new', NULL),
      'status',          jsonb_build_object('old', to_jsonb(v_before.status), 'new', NULL),
      'origin',          jsonb_build_object('old', to_jsonb(v_before.origin), 'new', NULL),
      'start_datetime',  jsonb_build_object('old', to_jsonb(v_before.start_datetime), 'new', NULL),
      'end_datetime',    jsonb_build_object('old', to_jsonb(v_before.end_datetime), 'new', NULL),
      'organization_id', jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', NULL)
    )
  );

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'schedule_items', p_id, v_audit_org, 'DELETE', v_diff, 'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reassign_visit(p_item_id uuid, p_new_user_id uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor    uuid;
  v_before   public.schedule_items;
  v_name     text;
  v_res      uuid;
  v_old_ids  uuid[];
  v_changes  text[] := ARRAY[]::text[];
  v_sync     jsonb;
  v_diff     jsonb;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.schedule_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'scheduling.items.edit', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar agendamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_schedule_item_scope_context(v_before.organization_id, 'scheduling.items.edit') ctx(applied_scope, owner_ids)
    WHERE ctx.applied_scope = 'ORG'
       OR v_before.created_by = ANY (ctx.owner_ids)
       OR v_before.user_id = ANY (ctx.owner_ids)
       OR public.schedule_item_assigned_to_owners(v_before.id, ctx.owner_ids)
  ) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_new_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador de destino em falta' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT u.name INTO v_name FROM public.anew_users u WHERE u.id = p_new_user_id AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilizador de destino não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_res := public.fn_owner_sync_resource_for_user(v_before.organization_id, p_new_user_id);
  IF v_res IS NULL THEN
    IF NOT public.has_anew_permission_for_org(auth.uid(), 'scheduling.resources.create', v_before.organization_id) THEN
      RAISE EXCEPTION '%', 'owner_without_schedule_resource: ' || COALESCE(v_name, '?');
    END IF;
    INSERT INTO public.schedule_resources
      (name, resource_type, user_id, color, is_active, metadata, created_by, organization_id)
    VALUES
      (COALESCE(v_name, 'Utilizador'), 'user', p_new_user_id, '#10b981', true, '{}'::jsonb, v_actor, v_before.organization_id)
    RETURNING id INTO v_res;
  END IF;

  -- Data (so se mudou). O bypass so cobre este UPDATE: a auditoria e manual, e a
  -- da lead/cliente (mais abaixo) tem de continuar activa.
  IF (p_start IS NOT NULL AND p_start IS DISTINCT FROM v_before.start_datetime)
     OR (p_end IS NOT NULL AND p_end IS DISTINCT FROM v_before.end_datetime) THEN
    PERFORM set_config('app.audit_bypass', 'on', true);
    UPDATE public.schedule_items
       SET start_datetime = COALESCE(p_start, start_datetime),
           end_datetime   = COALESCE(p_end, end_datetime)
     WHERE id = p_item_id;
    PERFORM set_config('app.audit_bypass', 'off', true);

    v_diff := jsonb_build_object('schedule_items', jsonb_build_object(
      'start_datetime', jsonb_build_object('old', to_jsonb(v_before.start_datetime), 'new', to_jsonb(COALESCE(p_start, v_before.start_datetime))),
      'end_datetime',   jsonb_build_object('old', to_jsonb(v_before.end_datetime),   'new', to_jsonb(COALESCE(p_end, v_before.end_datetime)))
    ));
    PERFORM public.fn_manual_audit_log(
      'schedule_items', p_item_id, COALESCE(v_before.organization_id, k_system_sentinel), 'UPDATE', v_diff, 'web_app'
    );
    v_changes := array_append(v_changes, 'datetime'::text);
  END IF;

  SELECT COALESCE(array_agg(resource_id), ARRAY[]::uuid[]) INTO v_old_ids
  FROM public.schedule_item_assignees WHERE item_id = p_item_id;

  IF NOT (v_old_ids = ARRAY[v_res]) THEN
    DELETE FROM public.schedule_item_assignees WHERE item_id = p_item_id;
    INSERT INTO public.schedule_item_assignees (item_id, resource_id) VALUES (p_item_id, v_res);
    v_changes := array_append(v_changes, 'assignee'::text);
  END IF;

  v_sync := public.fn_owner_sync_entity_from_visit(p_item_id, v_old_ids, ARRAY[v_res]);

  RETURN jsonb_build_object(
    'changes', to_jsonb(v_changes),
    'lead_id', v_sync -> 'lead_id',
    'client_id', v_sync -> 'client_id',
    'new_owner', COALESCE(v_sync -> 'new_owner', to_jsonb(p_new_user_id)),
    'other_visit_ids', COALESCE(v_sync -> 'other_visit_ids', '[]'::jsonb),
    'resource_id', to_jsonb(v_res)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_schedule_item(p_id uuid, p_board_id uuid DEFAULT NULL::uuid, p_set_board_id boolean DEFAULT false, p_title text DEFAULT NULL::text, p_set_title boolean DEFAULT false, p_description text DEFAULT NULL::text, p_set_description boolean DEFAULT false, p_location text DEFAULT NULL::text, p_set_location boolean DEFAULT false, p_start_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_start_datetime boolean DEFAULT false, p_end_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_end_datetime boolean DEFAULT false, p_status schedule_item_status DEFAULT NULL::schedule_item_status, p_set_status boolean DEFAULT false, p_origin schedule_item_origin DEFAULT NULL::schedule_item_origin, p_set_origin boolean DEFAULT false, p_contact_id uuid DEFAULT NULL::uuid, p_set_contact_id boolean DEFAULT false, p_client_id uuid DEFAULT NULL::uuid, p_set_client_id boolean DEFAULT false, p_employee_id uuid DEFAULT NULL::uuid, p_set_employee_id boolean DEFAULT false, p_user_id uuid DEFAULT NULL::uuid, p_set_user_id boolean DEFAULT false, p_notes text DEFAULT NULL::text, p_set_notes boolean DEFAULT false, p_metadata jsonb DEFAULT NULL::jsonb, p_set_metadata boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid, p_set_organization_id boolean DEFAULT false, p_time_off_type text DEFAULT NULL::text, p_set_time_off_type boolean DEFAULT false, p_approval_status text DEFAULT NULL::text, p_set_approval_status boolean DEFAULT false, p_approved_by uuid DEFAULT NULL::uuid, p_set_approved_by boolean DEFAULT false, p_approved_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_approved_at boolean DEFAULT false, p_lead_id uuid DEFAULT NULL::uuid, p_set_lead_id boolean DEFAULT false, p_entity_id uuid DEFAULT NULL::uuid, p_set_entity_id boolean DEFAULT false)
 RETURNS schedule_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor      uuid;
  v_before     public.schedule_items;
  v_item       public.schedule_items;
  v_old_json   jsonb;
  v_new_json   jsonb;
  v_item_diff  jsonb := '{}'::jsonb;
  v_key        text;
  v_noise_cols text[] := ARRAY['updated_at', 'created_at', 'duration_minutes'];
  v_audit_org  uuid;
  v_diff       jsonb;
  v_set_parts  text[]  := ARRAY[]::text[];
  v_sql        text;
  v_entity     uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row (before-image + guards) ──────────────────────────
  SELECT * INTO v_before FROM public.schedule_items WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with schedule_items UPDATE RLS ───────────────────
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'scheduling.items.edit', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar agendamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ambito (a5): so pode agir sobre itens dentro do seu ambito.
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_schedule_item_scope_context(v_before.organization_id, 'scheduling.items.edit') ctx(applied_scope, owner_ids)
    WHERE ctx.applied_scope = 'ORG'
       OR v_before.created_by = ANY (ctx.owner_ids)
       OR v_before.user_id = ANY (ctx.owner_ids)
       OR public.schedule_item_assigned_to_owners(v_before.id, ctx.owner_ids)
  ) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_set_organization_id THEN
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'scheduling.items.edit'))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Build the SET clause from ONLY the supplied whitelisted columns ───────
  IF p_set_board_id        THEN v_set_parts := v_set_parts || format('board_id = %L::uuid', p_board_id); END IF;
  IF p_set_title           THEN v_set_parts := v_set_parts || format('title = %L::text', p_title); END IF;
  IF p_set_description     THEN v_set_parts := v_set_parts || format('description = %L::text', p_description); END IF;
  IF p_set_location        THEN v_set_parts := v_set_parts || format('location = %L::text', p_location); END IF;
  IF p_set_start_datetime  THEN v_set_parts := v_set_parts || format('start_datetime = %L::timestamptz', p_start_datetime); END IF;
  IF p_set_end_datetime    THEN v_set_parts := v_set_parts || format('end_datetime = %L::timestamptz', p_end_datetime); END IF;
  IF p_set_status          THEN v_set_parts := v_set_parts || format('status = %L::public.schedule_item_status', p_status); END IF;
  IF p_set_origin          THEN v_set_parts := v_set_parts || format('origin = %L::public.schedule_item_origin', p_origin); END IF;
  IF p_set_contact_id      THEN v_set_parts := v_set_parts || format('contact_id = %L::uuid', p_contact_id); END IF;
  IF p_set_employee_id     THEN v_set_parts := v_set_parts || format('employee_id = %L::uuid', p_employee_id); END IF;
  IF p_set_user_id         THEN v_set_parts := v_set_parts || format('user_id = %L::uuid', p_user_id); END IF;
  IF p_set_notes           THEN v_set_parts := v_set_parts || format('notes = %L::text', p_notes); END IF;
  IF p_set_metadata        THEN v_set_parts := v_set_parts || format('metadata = %L::jsonb', p_metadata); END IF;
  IF p_set_organization_id THEN v_set_parts := v_set_parts || format('organization_id = %L::uuid', p_organization_id); END IF;
  IF p_set_time_off_type   THEN v_set_parts := v_set_parts || format('time_off_type = %L::text', p_time_off_type); END IF;
  IF p_set_approval_status THEN v_set_parts := v_set_parts || format('approval_status = %L::text', p_approval_status); END IF;
  IF p_set_approved_by     THEN v_set_parts := v_set_parts || format('approved_by = %L::uuid', p_approved_by); END IF;
  IF p_set_approved_at     THEN v_set_parts := v_set_parts || format('approved_at = %L::timestamptz', p_approved_at); END IF;
  -- 20261228200000: a pessoa da visita é schedule_items.entity_id. p_lead_id e
  -- p_client_id continuam aceites e resolvem-se para a entidade, na
  -- organização final do item.
  IF p_set_entity_id OR p_set_lead_id OR p_set_client_id THEN
    v_entity := public.fn_schedule_items_resolver_entidade(
      CASE WHEN p_set_organization_id THEN p_organization_id ELSE v_before.organization_id END,
      CASE WHEN p_set_entity_id THEN p_entity_id END,
      CASE WHEN p_set_lead_id THEN p_lead_id END,
      CASE WHEN p_set_client_id THEN p_client_id END);
    v_set_parts := v_set_parts || format('entity_id = %L::uuid', v_entity);
  ELSIF p_set_organization_id AND v_before.entity_id IS NOT NULL THEN
    -- mudar de organização sem mudar a pessoa: a pessoa tem de ser da nova
    PERFORM public.fn_schedule_items_resolver_entidade(p_organization_id, v_before.entity_id, NULL, NULL);
  END IF;

  IF array_length(v_set_parts, 1) IS NULL THEN
    RETURN v_before;
  END IF;

  v_sql := format(
    'UPDATE public.schedule_items SET %s WHERE id = %L::uuid RETURNING *',
    array_to_string(v_set_parts, ', '),
    p_id
  );
  EXECUTE v_sql INTO v_item;

  -- ── Build the diff (same noise-column exclusions as the schedule trigger) ─
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_item);

  FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
  LOOP
    CONTINUE WHEN v_key = ANY(v_noise_cols);
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_item_diff := v_item_diff || jsonb_build_object(
        v_key,
        jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  v_diff := '{}'::jsonb;
  IF v_item_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('schedule_items', v_item_diff);
  END IF;

  v_audit_org := COALESCE(v_item.organization_id, k_system_sentinel);

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'schedule_items', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_item;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_schedule_item_assignees(p_item_id uuid, p_resource_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor         uuid;
  v_org_id        uuid;
  v_effective_ids uuid[];
  v_old_ids       uuid[];
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (public.has_scheduling_permission(auth.uid(), 'scheduling.items.create')
          OR public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit')) THEN
    RAISE EXCEPTION 'Sem permissão para atribuir recursos ao agendamento' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.schedule_items
  WHERE id = p_item_id;

  IF v_org_id IS NULL
     OR NOT (v_org_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'scheduling.items.create'))
             OR v_org_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'scheduling.items.edit'))) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_items si
    CROSS JOIN LATERAL public.get_schedule_item_scope_context(si.organization_id, 'scheduling.items.edit') ctx(applied_scope, owner_ids)
    WHERE si.id = p_item_id
      AND (ctx.applied_scope = 'ORG'
        OR si.created_by = ANY (ctx.owner_ids)
        OR si.user_id = ANY (ctx.owner_ids)
        OR public.schedule_item_assigned_to_owners(si.id, ctx.owner_ids))
  ) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_effective_ids := COALESCE(p_resource_ids, ARRAY[]::uuid[]);

  SELECT COALESCE(array_agg(resource_id), ARRAY[]::uuid[]) INTO v_old_ids
  FROM public.schedule_item_assignees WHERE item_id = p_item_id;

  DELETE FROM public.schedule_item_assignees WHERE item_id = p_item_id;

  IF array_length(v_effective_ids, 1) IS NOT NULL THEN
    INSERT INTO public.schedule_item_assignees (item_id, resource_id)
    SELECT p_item_id, x
    FROM (SELECT DISTINCT unnest(v_effective_ids) AS x) d;
  END IF;

  RETURN public.fn_owner_sync_entity_from_visit(p_item_id, v_old_ids, v_effective_ids);
END;
$function$;
