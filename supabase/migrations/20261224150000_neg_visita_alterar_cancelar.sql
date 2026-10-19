-- ============================================================
-- 20261224150000_neg_visita_alterar_cancelar (M3)
-- ============================================================
-- O que faz (funções da página Pessoas para as visitas):
--   - NOVAS, INVOKER: neg_alterar_visita, neg_cancelar_visita e as
--     auxiliares fn_neg_visita_editavel (guardas comuns, com a linha da
--     visita bloqueada FOR NO KEY UPDATE) e fn_neg_detalhes_visita
--     (valida os detalhes guardados em schedule_items.metadata->'pessoas').
--   - SUBSTITUÍDA (mesma assinatura): neg_resultado_visita aceita
--     p_resultado NULL com p_feita = true (só marca 'completed', não toca no
--     resultado, não encerra a abordagem).
--   - NOVA ASSINATURA: neg_guardar_visita ganha p_detalhes jsonb DEFAULT NULL
--     (vai para metadata->'pessoas' pelo p_metadata do rpc_create_schedule_item).
--     A antiga é largada (DROP FUNCTION) e a nova criada nesta mesma
--     transacção: o PostgREST fica só com uma. NG010 passa a levar no DETAIL
--     o uuid do recurso ocupado.
--   Escritas no calendário pelas funções existentes, só CHAMADAS:
--   rpc_update_schedule_item (horas, quadro, título, notas, local, metadata;
--   estado 'cancelled'), rpc_update_schedule_item_assignees (só quando os
--   recursos mudam) e um UPDATE próprio de visit_kind (o rpc não o tem).
--   Lido na base a 19/10: rpc_update_schedule_item só mexe no status se lho
--   pedirem; mudar as horas limpa confirmed_at e passa 'confirmed' a
--   'scheduled' (trigger existente); o metadata é SUBSTITUÍDO, por isso a
--   função envia o actual com a chave 'pessoas' trocada. Mudar os recursos
--   de uma visita futura pode mudar o dono da lead/cliente (como no
--   calendário): devolvido em dono_alterado / novo_dono / outras_visitas.
--   Trocar os recursos de uma visita futura exige também poder editar a
--   lead (leads.edit, verificado pelo auxiliar DEFINER fn_neg_pode_mudar_dono_lead,
--   que resolve a lead como a troca de dono e só devolve boolean) e o
--   cliente (clients.edit) com âmbito (42501). O
--   retorno diz se a visita confirmada passou a 'scheduled' (desconfirmada).
--   Cancelar NÃO olha para levantamentos: o levantamento fica como está.
--   Cancelar também não repõe anew_leads.status nem scheduled_visit_id.
--   A visita só se bloqueia depois de confirmada a configuração da
--   organização: uma visita da Mudelar nunca é bloqueada.
-- Erros novos: NG017 visita indisponível (não existe, não se vê, organização
--   sem a página Pessoas, ausência, férias, quadro de frota, sem pessoa);
--   NG018 a visita já foi feita, cancelada, tem resultado ou é de um negócio
--   fechado (e, em neg_resultado_visita, cancelada). NG010 com DETAIL.
--   Nota: o texto do contrato fala também em NG004/NG002 para alterar e
--   cancelar; usam-se NG017/NG018 (os códigos novos declarados no contrato).
-- Só altera objectos NOSSOS. Não bloqueia tabelas. NÃO altera
--   rpc_update_schedule_item, rpc_update_schedule_item_assignees,
--   rpc_create_schedule_item, check_schedule_conflict nem triggers do
--   calendário. Funções partilhadas com a Mudelar: só chamadas; nada das
--   funções novas corre na Mudelar (sem configuração dá NG017; NG008 em
--   neg_guardar_visita, como antes).
-- A UI precisa de: chamar as RPC novas; passar a enviar p_detalhes; ler o
--   DETAIL do NG010; regenerar os tipos (a assinatura de neg_guardar_visita muda).
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição: as versões a substituir são as lidas a 19/10.
DO $$
DECLARE
  v_txt text;
BEGIN
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.neg_resultado_visita(uuid,text,boolean)', 'be624d75021da9122c97ae7f2bd4ca1c'),
              ('public.neg_guardar_visita(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text,numeric,numeric,uuid[],text,uuid)',
               '28dc0d0b9f5ccd85b5a0db343ec3a3b7')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 19/10: %; nada feito.', v_txt;
  END IF;
END;
$$;

-- Detalhes da visita (metadata->'pessoas'). NULL = sem detalhes.
CREATE FUNCTION public.fn_neg_detalhes_visita(p_detalhes jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_morada jsonb;
BEGIN
  IF p_detalhes IS NULL OR p_detalhes = 'null'::jsonb THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_detalhes) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: detalhes da visita.' USING ERRCODE = 'NG009';
  END IF;
  IF octet_length(p_detalhes::text) > 2000
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_detalhes) AS k(chave)
                WHERE k.chave NOT IN ('morada', 'igual_a_lead', 'presentes'))
     OR jsonb_typeof(COALESCE(p_detalhes -> 'igual_a_lead', 'null'::jsonb)) NOT IN ('boolean', 'null')
     OR jsonb_typeof(COALESCE(p_detalhes -> 'presentes', 'null'::jsonb)) NOT IN ('string', 'null')
     OR (p_detalhes ->> 'presentes') NOT IN ('cliente', 'casal', 'familia', 'outra') THEN
    RAISE EXCEPTION 'Valor inválido: detalhes da visita.' USING ERRCODE = 'NG009';
  END IF;

  v_morada := p_detalhes -> 'morada';
  IF v_morada IS NOT NULL AND v_morada <> 'null'::jsonb THEN
    IF jsonb_typeof(v_morada) <> 'object' THEN
      RAISE EXCEPTION 'Valor inválido: morada da visita.' USING ERRCODE = 'NG009';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(v_morada) AS m(chave, valor)
                  WHERE m.chave NOT IN ('rua', 'codigo_postal', 'localidade', 'andar')
                     OR jsonb_typeof(m.valor) NOT IN ('string', 'null'))
       OR char_length(v_morada ->> 'rua') > 300
       OR char_length(v_morada ->> 'localidade') > 120
       OR char_length(v_morada ->> 'andar') > 60
       OR (v_morada ->> 'codigo_postal') !~ '^[0-9]{4}-[0-9]{3}$' THEN
      RAISE EXCEPTION 'Valor inválido: morada da visita.' USING ERRCODE = 'NG009';
    END IF;
  END IF;

  RETURN p_detalhes;
END;
$function$;

-- Guardas comuns de alterar e cancelar, por ordem: a organização da visita
-- lida SEM bloqueio; a organização tem configuração; só então a linha
-- bloqueada sob RLS (UPDATE de schedule_items). "Não existe", "não se vê" e
-- "organização sem a página Pessoas" dão a mesma resposta (NG017), e nunca
-- se bloqueia uma visita de uma organização sem configuração (a Mudelar).
-- Depois: é uma visita de uma pessoa (NG017); pessoas.edit com âmbito
-- (42501); estado (NG018). Com p_aceitar_cancelada, uma cancelada volta sem erro.
CREATE FUNCTION public.fn_neg_visita_editavel(p_visita_id uuid, p_aceitar_cancelada boolean)
  RETURNS public.schedule_items
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_vis  public.schedule_items;
  v_org  uuid;
  v_tipo text;
BEGIN
  SELECT s.organization_id INTO v_org
  FROM public.schedule_items s
  WHERE s.id = p_visita_id;
  IF v_org IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c WHERE c.organization_id = v_org) THEN
    RAISE EXCEPTION 'Visita indisponível.' USING ERRCODE = 'NG017';
  END IF;

  SELECT s.* INTO v_vis
  FROM public.schedule_items s
  WHERE s.id = p_visita_id AND s.organization_id = v_org
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita indisponível.' USING ERRCODE = 'NG017';
  END IF;

  SELECT b.board_type INTO v_tipo FROM public.schedule_boards b WHERE b.id = v_vis.board_id;
  IF v_vis.time_off_type IS NOT NULL OR v_vis.vacation_id IS NOT NULL
     OR v_tipo IN ('time_off', 'fleet')
     OR (v_vis.lead_id IS NULL AND v_vis.client_id IS NULL) THEN
    RAISE EXCEPTION 'Visita indisponível.' USING ERRCODE = 'NG017';
  END IF;

  IF NOT (public.has_anew_permission(auth.uid(), 'pessoas.edit')
          AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                      WHERE k.scope_key = v_vis.organization_id::text || ':*'
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.created_by::text
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.user_id::text)) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_aceitar_cancelada AND v_vis.status = 'cancelled'::public.schedule_item_status THEN
    RETURN v_vis;
  END IF;

  IF v_vis.status IN ('completed'::public.schedule_item_status, 'cancelled'::public.schedule_item_status)
     OR v_vis.visit_outcome IS NOT NULL
     OR (v_vis.negocio_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.negocios n
                         WHERE n.id = v_vis.negocio_id AND n.estado = 'aberto' AND n.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'A visita já foi feita, cancelada ou tem resultado, ou o negócio dela está fechado: não se altera.'
      USING ERRCODE = 'NG018';
  END IF;

  RETURN v_vis;
END;
$function$;

-- Pode o chamador mudar o dono da(s) lead(s) que a troca de recursos desta
-- visita alteraria? Resolve a lead como fn_owner_sync_entity_from_visit:
-- lead_id; senão metadata.lead_id (se for uuid; uma lead que já não existe
-- conta como "sem lead", como lá); senão as leads com scheduled_visit_id
-- igual à visita (lá é LIMIT 1 sem ORDER BY: aqui exigem-se TODAS). Só
-- contam leads vivas da organização da visita (as únicas em que a troca
-- mexe). Cada uma exige leads.edit com âmbito, como a política de UPDATE de
-- anew_leads. DEFINER para ver as leads que o chamador não vê; devolve só
-- um boolean e false para tudo o que não seja uma visita da organização do
-- chamador, com a página Pessoas activa e com pessoas.edit com âmbito sobre
-- ela (falha fechada; sem isto não revela se há lead ligada).
CREATE FUNCTION public.fn_neg_pode_mudar_dono_lead(p_visita_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_org    uuid;
  v_lead   uuid;
  v_meta   text;
  v_criou  uuid;
  v_user   uuid;
  v_leads  uuid[];
  v_keys   text[];
BEGIN
  SELECT s.organization_id, s.lead_id, s.metadata ->> 'lead_id', s.created_by, s.user_id
    INTO v_org, v_lead, v_meta, v_criou, v_user
  FROM public.schedule_items s
  WHERE s.id = p_visita_id;
  IF v_uid IS NULL OR v_org IS NULL
     OR NOT (v_org IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c WHERE c.organization_id = v_org) THEN
    RETURN false;
  END IF;

  -- Sem pessoas.edit com âmbito sobre a visita (o mesmo teste de
  -- fn_neg_visita_editavel), false sem olhar para leads: não é oráculo.
  IF NOT (public.has_anew_permission(v_uid, 'pessoas.edit')
          AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                      WHERE k.scope_key = v_org::text || ':*'
                         OR k.scope_key = v_org::text || ':' || v_criou::text
                         OR k.scope_key = v_org::text || ':' || v_user::text)) THEN
    RETURN false;
  END IF;

  IF v_lead IS NOT NULL THEN
    v_leads := ARRAY[v_lead];
  ELSIF v_meta ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_leads := ARRAY[v_meta::uuid];
  ELSE
    v_leads := ARRAY(SELECT l.id FROM public.anew_leads l WHERE l.scheduled_visit_id = p_visita_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_leads l
                 WHERE l.id = ANY (v_leads) AND l.organization_id = v_org AND l.deleted_at IS NULL) THEN
    RETURN true;
  END IF;

  IF NOT public.has_anew_permission(v_uid, 'leads.edit') THEN
    RETURN false;
  END IF;
  v_keys := public.crm_scope_keys('leads.edit');
  RETURN NOT EXISTS (
    SELECT 1 FROM public.anew_leads l
    WHERE l.id = ANY (v_leads) AND l.organization_id = v_org AND l.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM unnest(v_keys) AS k(scope_key)
                      WHERE k.scope_key = l.organization_id::text || ':*'
                         OR k.scope_key = l.organization_id::text || ':' || l.assigned_to::text
                         OR k.scope_key = l.organization_id::text || ':' || l.created_by::text));
END;
$function$;

CREATE FUNCTION public.neg_alterar_visita(
  p_visita_id uuid,
  p_board_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_titulo text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_local text DEFAULT NULL,
  p_recursos uuid[] DEFAULT NULL,
  p_visit_kind text DEFAULT NULL,
  p_detalhes jsonb DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
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
BEGIN
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
    IF v_vis.client_id IS NOT NULL THEN
      PERFORM 1 FROM public.anew_clients c
      WHERE c.id = v_vis.client_id AND c.organization_id = v_vis.organization_id AND c.deleted_at IS NULL
      FOR NO KEY UPDATE;
      IF NOT FOUND AND NOT EXISTS (
           SELECT 1 FROM public.anew_clients c
           WHERE c.id = v_vis.client_id
             AND (c.deleted_at IS NOT NULL OR c.organization_id <> v_vis.organization_id)) THEN
        RAISE EXCEPTION 'Sem permissão para mudar o responsável do cliente desta visita.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
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
  IF v_m_quadro OR v_m_titulo OR v_m_notas OR v_m_local OR v_m_horas OR v_m_meta THEN
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

CREATE FUNCTION public.neg_cancelar_visita(p_visita_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_vis public.schedule_items;
BEGIN
  v_vis := public.fn_neg_visita_editavel(p_visita_id, true);

  IF v_vis.status = 'cancelled'::public.schedule_item_status THEN
    RETURN jsonb_build_object('visita_id', v_vis.id, 'mudou', false);
  END IF;

  -- Nunca DELETE; o levantamento que aponte para esta visita fica como está.
  -- Não repõe anew_leads.status nem anew_leads.scheduled_visit_id.
  PERFORM public.rpc_update_schedule_item(
    p_id         => v_vis.id,
    p_status     => 'cancelled'::public.schedule_item_status,
    p_set_status => true);
  PERFORM set_config('app.audit_bypass', 'off', true);

  RETURN jsonb_build_object('visita_id', v_vis.id, 'mudou', true);
END;
$function$;

-- Resultado de uma visita existente. Igual à versão de 19/10, mais:
-- p_resultado NULL com p_feita = true só dá a visita como feita; uma visita
-- cancelada dá NG018; "não existe" e "organização sem configuração" dão a
-- mesma resposta, NG004 (antes, a organização sem configuração dava NG008).
CREATE OR REPLACE FUNCTION public.neg_resultado_visita(
  p_visita_id uuid, p_resultado text, p_feita boolean DEFAULT true)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_vis      record;
  v_entity   uuid;
  v_lead     uuid;
  v_feita    boolean := COALESCE(p_feita, false);
  v_concluir boolean;
  v_mudou    boolean := false;
  v_motivo   text;
  v_n        int;
BEGIN
  IF p_visita_id IS NULL
     OR (p_resultado IS NULL AND NOT v_feita)
     OR p_resultado NOT IN ('interessado', 'aPensar', 'semInteresse', 'obraInviavel') THEN
    RAISE EXCEPTION 'Valor inválido: resultado da visita.' USING ERRCODE = 'NG009';
  END IF;

  SELECT s.organization_id, s.negocio_id, s.lead_id, s.client_id, s.visit_outcome, s.status,
         s.start_datetime, s.created_by, s.user_id
    INTO v_vis
  FROM public.schedule_items s
  WHERE s.id = p_visita_id AND s.time_off_type IS NULL AND s.vacation_id IS NULL;
  -- "Não existe", "não se vê" e "organização sem a página Pessoas": a mesma resposta.
  IF NOT FOUND
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                    WHERE c.organization_id = v_vis.organization_id) THEN
    RAISE EXCEPTION 'Visita indisponível.' USING ERRCODE = 'NG004';
  END IF;

  -- pessoas.edit com âmbito sobre a visita (org:*, criador ou utilizador).
  IF NOT (public.has_anew_permission(auth.uid(), 'pessoas.edit')
          AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                      WHERE k.scope_key = v_vis.organization_id::text || ':*'
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.created_by::text
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.user_id::text)) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Uma visita cancelada não se dá como feita nem recebe resultado (com e sem resultado).
  IF v_vis.status = 'cancelled'::public.schedule_item_status THEN
    RAISE EXCEPTION 'A visita foi cancelada: não recebe resultado.' USING ERRCODE = 'NG018';
  END IF;

  IF v_feita AND v_vis.start_datetime > now() THEN
    RAISE EXCEPTION 'Valor inválido: uma visita no futuro não pode ser dada como feita.' USING ERRCODE = 'NG009';
  END IF;

  -- status só entra no UPDATE quando muda (o trigger dos feriados corre em UPDATE OF status).
  v_concluir := v_feita AND v_vis.status <> 'completed'::public.schedule_item_status;

  IF p_resultado IS NULL THEN
    -- Só "feita": não toca no resultado nem na abordagem.
    IF v_concluir THEN
      UPDATE public.schedule_items s
      SET status = 'completed'::public.schedule_item_status
      WHERE s.id = p_visita_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
      END IF;
      v_mudou := true;
    END IF;
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', NULL);
  END IF;

  IF v_concluir THEN
    UPDATE public.schedule_items s
    SET visit_outcome = p_resultado, status = 'completed'::public.schedule_item_status
    WHERE s.id = p_visita_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_vis.visit_outcome IS DISTINCT FROM p_resultado THEN
    UPDATE public.schedule_items s
    SET visit_outcome = p_resultado
    WHERE s.id = p_visita_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    v_n := -1;
  END IF;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_mudou := v_n = 1;

  IF p_resultado NOT IN ('semInteresse', 'obraInviavel') THEN
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', NULL);
  END IF;

  SELECT l.entity_id, l.id INTO v_entity, v_lead
  FROM public.anew_leads l
  WHERE l.id = v_vis.lead_id AND l.organization_id = v_vis.organization_id;
  IF v_entity IS NULL THEN
    SELECT c.entity_id INTO v_entity
    FROM public.anew_clients c
    WHERE c.id = v_vis.client_id AND c.organization_id = v_vis.organization_id;
  END IF;

  IF v_vis.negocio_id IS NOT NULL THEN
    v_motivo := 'visita_de_negocio';
  ELSIF v_entity IS NULL THEN
    v_motivo := 'sem_pessoa';
  ELSIF public.fn_neg_tem_negocio_aberto(v_vis.organization_id, v_entity) THEN
    v_motivo := 'negocios_abertos';
  ELSIF NOT EXISTS (SELECT 1 FROM public.anew_leads l
                    WHERE l.organization_id = v_vis.organization_id AND l.entity_id = v_entity
                      AND l.deleted_at IS NULL) THEN
    v_motivo := 'sem_lead';
  END IF;

  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', v_motivo);
  END IF;

  -- A lead da visita, se ainda viva; senão a mais recente da pessoa.
  IF NOT EXISTS (SELECT 1 FROM public.anew_leads l WHERE l.id = v_lead AND l.deleted_at IS NULL) THEN
    v_lead := NULL;
  END IF;
  v_mudou := (public.fn_neg_mudar_abordagem(
    v_vis.organization_id, v_entity, v_lead, p_resultado, NULL, 'Resultado da visita')
    ->> 'mudou')::boolean OR v_mudou;

  RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', true,
                            'motivo_nao_encerrada', NULL);
END;
$function$;

-- neg_guardar_visita: assinatura nova (p_detalhes). Larga a antiga e cria a
-- nova na mesma transacção. Igual à versão de 19/10 salvo p_detalhes e o
-- DETAIL do NG010.
DROP FUNCTION public.neg_guardar_visita(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, numeric, numeric, uuid[], text, uuid);

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
  p_negocio_id uuid DEFAULT NULL,
  p_detalhes jsonb DEFAULT NULL)
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
  v_det        jsonb;
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
  v_det := public.fn_neg_detalhes_visita(p_detalhes);

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
      RAISE EXCEPTION 'O recurso já tem outra marcação nesse horário.'
        USING ERRCODE = 'NG010', DETAIL = v_r::text;
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
    p_metadata             => CASE WHEN v_det IS NULL THEN NULL
                                   ELSE jsonb_build_object('pessoas', v_det) END,
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

REVOKE ALL ON FUNCTION public.fn_neg_detalhes_visita(jsonb)          FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_visita_editavel(uuid, boolean)  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_pode_mudar_dono_lead(uuid)      FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_alterar_visita(uuid, uuid, timestamptz, timestamptz, text, text, text, uuid[], text, jsonb) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_cancelar_visita(uuid)              FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_resultado_visita(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_guardar_visita(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, numeric, numeric, uuid[], text, uuid, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_detalhes_visita(jsonb)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_visita_editavel(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_pode_mudar_dono_lead(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_alterar_visita(uuid, uuid, timestamptz, timestamptz, text, text, text, uuid[], text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_cancelar_visita(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_resultado_visita(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_guardar_visita(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, numeric, numeric, uuid[], text, uuid, jsonb) TO authenticated;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. funções: assinatura, DEFINER só neg_guardar_visita, search_path fixo,
  --    sem anon, com authenticated
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_detalhes_visita(jsonb)', false),
              ('public.fn_neg_visita_editavel(uuid,boolean)', false),
              ('public.fn_neg_pode_mudar_dono_lead(uuid)', true),
              ('public.neg_alterar_visita(uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text,uuid[],text,jsonb)', false),
              ('public.neg_cancelar_visita(uuid)', false),
              ('public.neg_resultado_visita(uuid,text,boolean)', false),
              ('public.neg_guardar_visita(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text,numeric,numeric,uuid[],text,uuid,jsonb)', true)
            ) AS e(sig, definer)
            LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef <> e.definer
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp'
               OR has_function_privilege('anon', p.oid, 'EXECUTE')
               OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
               OR (p.proname <> 'neg_resultado_visita' AND has_function_privilege('service_role', p.oid, 'EXECUTE')));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (1. funções): falha em %', v_txt;
  END IF;

  -- 1b. as substituições são as desta migration (texto que só existe nas versões novas)
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                 WHERE p.oid = to_regprocedure('public.neg_resultado_visita(uuid,text,boolean)')
                   AND p.prosrc LIKE '%NG018%')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure('public.neg_alterar_visita(uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text,uuid[],text,jsonb)')
                      AND p.prosrc LIKE '%desconfirmada%' AND p.prosrc LIKE '%fn_neg_pode_mudar_dono_lead%')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure('public.fn_neg_visita_editavel(uuid,boolean)')
                      AND p.prosrc LIKE '%negocio_workflow_config%')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure('public.fn_neg_pode_mudar_dono_lead(uuid)')
                      AND p.prosrc LIKE '%pessoas.edit%' AND p.prosrc LIKE '%leads.edit%') THEN
    RAISE EXCEPTION 'CONFERIR (1b. versões novas das funções de visita)';
  END IF;

  -- 2. uma só de cada (o PostgREST não pode ficar com duas neg_guardar_visita),
  --    e a nova neg_guardar_visita só para authenticated
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
      WHERE s.nspname = 'public' AND p.proname IN ('neg_guardar_visita', 'neg_resultado_visita',
                                                   'neg_alterar_visita', 'neg_cancelar_visita')) <> 4 THEN
    RAISE EXCEPTION 'CONFERIR (2. sobrecargas das funções de visita)';
  END IF;
  IF has_function_privilege('service_role',
       to_regprocedure('public.neg_guardar_visita(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text,numeric,numeric,uuid[],text,uuid,jsonb)'),
       'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR (2b. neg_guardar_visita executável por service_role)';
  END IF;

  -- 3. funções existentes chamadas, iguais (md5 lidos a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.rpc_update_schedule_item(uuid,uuid,boolean,text,boolean,text,boolean,text,boolean,timestamp with time zone,boolean,timestamp with time zone,boolean,schedule_item_status,boolean,schedule_item_origin,boolean,uuid,boolean,uuid,boolean,uuid,boolean,uuid,boolean,text,boolean,jsonb,boolean,uuid,boolean,text,boolean,text,boolean,uuid,boolean,timestamp with time zone,boolean,uuid,boolean)',
               '7458601d667457322806cdcf2809798c'),
              ('public.rpc_update_schedule_item_assignees(uuid,uuid[])', 'd851d0d635feb1d130b75db73a65c037'),
              ('public.fn_owner_sync_entity_from_visit(uuid,uuid[],uuid[])', '9dbbb19f8356523d5de531f7ed648c1f'),
              ('public.rpc_create_schedule_item(uuid,uuid,text,text,schedule_item_status,schedule_item_origin,timestamp with time zone,timestamp with time zone,boolean,uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,text,integer,text[],text,jsonb,text,text,uuid[],uuid)',
               'f2bd379b10a1fa019bf4b3e23b34ada9'),
              ('public.check_schedule_conflict(uuid,timestamp with time zone,timestamp with time zone,uuid)', '0cef32398d3cea80b0853cf69a548657'),
              ('public.current_business_user_id()',     '7e60101f074e4ff526559140be6618bb'),
              ('public.crm_scope_keys(text)',           '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)', '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',     '29782031244dd3b0842ca43b271e2bf1'),
              ('public.fn_neg_exigir_config(uuid)',     '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_tem_negocio_aberto(uuid,uuid)', 'e8daaa5be371115fdb0bcbdc33d77f60'),
              ('public.fn_neg_mudar_abordagem(uuid,uuid,uuid,text,text,text)', 'ad65ef03cf301444914f4a9dcf4f864b')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (3. funções existentes mudaram): %', v_txt;
  END IF;

  -- 4. colunas usadas, com o tipo esperado
  IF (SELECT count(*)
      FROM (VALUES ('schedule_items', 'metadata', 'jsonb'), ('schedule_items', 'visit_kind', 'text'),
                   ('schedule_items', 'visit_outcome', 'text'), ('schedule_items', 'negocio_id', 'uuid'),
                   ('schedule_boards', 'board_type', 'text'), ('schedule_boards', 'is_active', 'boolean'),
                   ('schedule_item_assignees', 'resource_id', 'uuid')) AS e(t, c, ty)
      JOIN pg_attribute a ON a.attrelid = to_regclass('public.' || e.t)
                         AND a.attname::text = e.c AND NOT a.attisdropped
                         AND format_type(a.atttypid, a.atttypmod) = e.ty) <> 7 THEN
    RAISE EXCEPTION 'CONFERIR (4. colunas do calendário)';
  END IF;
END;
$$;

COMMIT;
