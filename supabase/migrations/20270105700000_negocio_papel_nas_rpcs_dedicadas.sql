-- ============================================================
-- 20270105700000_negocio_papel_nas_rpcs_dedicadas
-- ============================================================
-- O que faz: o Papel no Negócio (neg_papeis_permissoes, pelo RH) passa a contar nas RPCs dedicadas do Negócio como já conta em
--   neg_guardar_negocio (fn_cat_exigir(org, 'pessoas.edit') aceita fn_neg_papel_permite): neg_registar_contacto, neg_guardar_visita,
--   neg_alterar_visita, neg_cancelar_visita (fn_neg_visita_editavel), neg_resultado_visita, neg_guardar_levantamento, neg_perder_negocio,
--   neg_anular_perda. E corrige a mensagem de obra_guardar_negocio que citava negocios.obra.planear quando falta negocios.obra.executar (a de
--   fn_obra_execucao_permitida; a do estado da tarefa já fora corrigida em 20270105500000).
-- Onde o papel conta (fn_neg_papel_conta): o negócio da organização onde a pessoa é membro e o papel dá pessoas.edit - o mesmo alcance que
--   neg_guardar_negocio já dá a esse papel (e que fn_neg_sincronizar_visitas usa para criar/mover/cancelar as visitas do negócio). Só em ações
--   ligadas a um negócio: um contacto/levantamento/visita sem negócio continua a pedir a permissão da organização com âmbito.
-- Porque o invólucro DEFINER (e não converter as RPCs): estas RPCs são INVOKER e a porta real são as políticas de negocios, schedule_items e
--   levantamentos (só olham para a organização). Converter para DEFINER obrigava a reescrever todas as políticas em código para quem já
--   passa. Assim, quem passa pela organização segue exatamente o caminho de sempre (INVOKER, com as políticas); só quem NÃO passa e tem o
--   papel (fn_neg_negocio_so_papel / fn_neg_visita_so_papel) é encaminhado para um invólucro DEFINER que verifica o papel, liga
--   app.neg_via_papel e chama a mesma RPC com os privilégios do dono. Dentro, a RPC re-verifica o papel (fn_neg_papel_conta) antes de saltar
--   qualquer verificação; app.neg_via_papel sozinho não dá nada (quem o ligasse continuava sujeito às políticas, como INVOKER).
--   neg_guardar_visita já é DEFINER: muda só nas portas. A agenda (rpc_create/update_schedule_item) pede scheduling.items.*; pelo papel, sem
--   essa permissão, a visita escreve-se direto em schedule_items, como fn_neg_sincronizar_visitas; mudar os recursos (e o dono da lead)
--   continua a pedir a permissão da agenda.
--   As permissões finas (negocios.contacto.registar, negocios.visita.gerir, negocios.perder) continuam a ser pedidas como antes (fn_cat_pode).
-- 11 funções de CREATE OR REPLACE (as 8 RPCs, fn_neg_visita_editavel, fn_levantamentos_validar_ligacoes - a porta do negócio ao ligar o
--   levantamento, que espelha negocios_update - e obra_guardar_negocio) a partir do texto vivo (pg_get_functiondef na base RH a 3/11/2026, depois de 20270105600000; guardas md5) e
--   10 funções novas (3 auxiliares + 7 invólucros), com EXECUTE só para authenticated e service_role (como as RPCs).
-- Reversão (só como migration nova): repor as 11 funções com o texto vivo de 3/11 e apagar as 10 novas.
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF md5(pg_get_functiondef('public.fn_levantamentos_validar_ligacoes(uuid,uuid,uuid,uuid,uuid)'::regprocedure)) <> '3a99e0d81e14c149aeba3d2b50f55c93' OR md5(pg_get_functiondef('public.fn_neg_visita_editavel(uuid,boolean)'::regprocedure)) <> 'bca4cbad0e422897fa7c74a9a4777fda' OR md5(pg_get_functiondef('public.neg_perder_negocio(uuid,text,text)'::regprocedure)) <> '0c16cd88128e76ef76424c628e0d0c35' OR md5(pg_get_functiondef('public.neg_anular_perda(uuid,text)'::regprocedure)) <> 'f559711eb8a3885ce49def41096a6658' OR md5(pg_get_functiondef('public.neg_registar_contacto(uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone,uuid)'::regprocedure)) <> 'f3045cc3c0a37b3bb0d6a2cc9991bd64' OR md5(pg_get_functiondef('public.neg_guardar_levantamento(uuid,uuid,uuid,jsonb,jsonb,jsonb,uuid)'::regprocedure)) <> 'b1c003960f261c5e5b19656cfc0a523c' OR md5(pg_get_functiondef('public.neg_resultado_visita(uuid,text,boolean)'::regprocedure)) <> 'cf2b7a102484678a88a06057be78049d' OR md5(pg_get_functiondef('public.neg_cancelar_visita(uuid)'::regprocedure)) <> 'bc22d985e22e3e4cc6ff36e1816f7307' OR md5(pg_get_functiondef('public.neg_alterar_visita(uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text,uuid[],text,jsonb)'::regprocedure)) <> 'fc754bbe2310466e22317df93593fd06' OR md5(pg_get_functiondef('public.neg_guardar_visita(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text,numeric,numeric,uuid[],text,uuid,jsonb)'::regprocedure)) <> '0d62067d2b7470ea221d716be4b08c06' OR md5(pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) <> '5695a7cbc7aaf6674af624f2dd331bb0' THEN
    RAISE EXCEPTION 'Guarda: uma das 11 funções mudou desde 3/11/2026. Refazer esta migration a partir do pg_get_functiondef vivo.';
  END IF;
  IF to_regprocedure('public.fn_neg_papel_permite(uuid,text)') IS NULL OR to_regprocedure('public.fn_neg_pode_editar(negocios)') IS NULL
     OR to_regprocedure('public.has_scheduling_permission(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam funções de que esta migration depende.';
  END IF;
END $do$;

-- ------------------------------------------------------------------ fn_neg_papel_conta
-- O Papel no Negócio conta neste negócio: há sessão, o negócio existe (não apagado), a pessoa é membro da organização dele e o papel
-- dá pessoas.edit nessa organização (fn_neg_papel_permite) - o mesmo que neg_guardar_negocio aceita (fn_cat_exigir(org, 'pessoas.edit')),
-- com a condição a mais de ser membro da organização.
CREATE OR REPLACE FUNCTION public.fn_neg_papel_conta(p_negocio uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM negocios n
    WHERE n.id = p_negocio AND n.deleted_at IS NULL
      AND n.organization_id IN (SELECT public.get_user_crm_org_ids(auth.uid()))
      AND public.fn_neg_papel_permite(n.organization_id, 'pessoas.edit'))
$function$;

-- ------------------------------------------------------------------ fn_neg_negocio_so_papel
-- Encaminhamento: o papel conta e a permissão da organização NÃO chega para este negócio (as políticas negocios_select + negocios_update:
-- pessoas.view e pessoas.edit com âmbito). Quem passa pela organização segue o caminho de sempre (INVOKER, com as políticas).
CREATE OR REPLACE FUNCTION public.fn_neg_negocio_so_papel(p_negocio uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.fn_neg_papel_conta(p_negocio) AND NOT EXISTS (
    SELECT 1 FROM negocios n
    WHERE n.id = p_negocio AND public.fn_neg_pode_editar(n)
      AND public.has_anew_permission(auth.uid(), 'pessoas.view')
      AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.view')) AS k(scope_key)
                     WHERE k.scope_key = n.organization_id::text || ':*'
                        OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                        OR k.scope_key = n.organization_id::text || ':' || n.created_by::text))
$function$;

-- ------------------------------------------------------------------ fn_neg_visita_so_papel
-- Encaminhamento das RPCs de visita: a visita é de um negócio onde o papel conta e a organização NÃO chega (pessoas.edit com âmbito sobre
-- a visita e scheduling.items.edit, o que fn_neg_visita_editavel, as políticas de schedule_items e rpc_update_schedule_item pedem).
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
               AND public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit')))
$function$;

CREATE OR REPLACE FUNCTION public.fn_neg_papel_perder_negocio(p_negocio_id uuid, p_fase text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  -- 20270105700000: invólucro do Papel no Negócio. Verifica o encaminhamento e chama a RPC com os privilégios do dono (sem as políticas
  -- de negocios/schedule_items/levantamentos, que só olham para a organização); a RPC re-verifica o papel e todas as outras regras.
  IF NOT public.fn_neg_negocio_so_papel(p_negocio_id) THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  PERFORM set_config('app.neg_via_papel', 'on', true);
  v := public.neg_perder_negocio(p_negocio_id, p_fase, p_motivo);
  PERFORM set_config('app.neg_via_papel', 'off', true);
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_neg_papel_anular_perda(p_negocio_id uuid, p_motivo_reabertura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  -- 20270105700000: invólucro do Papel no Negócio. Verifica o encaminhamento e chama a RPC com os privilégios do dono (sem as políticas
  -- de negocios/schedule_items/levantamentos, que só olham para a organização); a RPC re-verifica o papel e todas as outras regras.
  IF NOT public.fn_neg_negocio_so_papel(p_negocio_id) THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  PERFORM set_config('app.neg_via_papel', 'on', true);
  v := public.neg_anular_perda(p_negocio_id, p_motivo_reabertura);
  PERFORM set_config('app.neg_via_papel', 'off', true);
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_neg_papel_registar_contacto(p_id uuid, p_organization_id uuid, p_entity_id uuid, p_resultado text, p_nota text, p_quando timestamp with time zone, p_proxima_acao_em timestamp with time zone, p_negocio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  -- 20270105700000: invólucro do Papel no Negócio. Verifica o encaminhamento e chama a RPC com os privilégios do dono (sem as políticas
  -- de negocios/schedule_items/levantamentos, que só olham para a organização); a RPC re-verifica o papel e todas as outras regras.
  IF NOT public.fn_neg_negocio_so_papel(p_negocio_id) THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  PERFORM set_config('app.neg_via_papel', 'on', true);
  v := public.neg_registar_contacto(p_id, p_organization_id, p_entity_id, p_resultado, p_nota, p_quando, p_proxima_acao_em, p_negocio_id);
  PERFORM set_config('app.neg_via_papel', 'off', true);
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_neg_papel_guardar_levantamento(p_id uuid, p_organization_id uuid, p_entity_id uuid, p_dados jsonb, p_linhas jsonb, p_respostas jsonb, p_negocio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  -- 20270105700000: invólucro do Papel no Negócio. Verifica o encaminhamento e chama a RPC com os privilégios do dono (sem as políticas
  -- de negocios/schedule_items/levantamentos, que só olham para a organização); a RPC re-verifica o papel e todas as outras regras.
  IF NOT public.fn_neg_negocio_so_papel(p_negocio_id) THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  PERFORM set_config('app.neg_via_papel', 'on', true);
  v := public.neg_guardar_levantamento(p_id, p_organization_id, p_entity_id, p_dados, p_linhas, p_respostas, p_negocio_id);
  PERFORM set_config('app.neg_via_papel', 'off', true);
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_neg_papel_cancelar_visita(p_visita_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  -- 20270105700000: invólucro do Papel no Negócio. Verifica o encaminhamento e chama a RPC com os privilégios do dono (sem as políticas
  -- de negocios/schedule_items/levantamentos, que só olham para a organização); a RPC re-verifica o papel e todas as outras regras.
  IF NOT public.fn_neg_visita_so_papel(p_visita_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.neg_via_papel', 'on', true);
  v := public.neg_cancelar_visita(p_visita_id);
  PERFORM set_config('app.neg_via_papel', 'off', true);
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_neg_papel_resultado_visita(p_visita_id uuid, p_resultado text, p_feita boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  -- 20270105700000: invólucro do Papel no Negócio. Verifica o encaminhamento e chama a RPC com os privilégios do dono (sem as políticas
  -- de negocios/schedule_items/levantamentos, que só olham para a organização); a RPC re-verifica o papel e todas as outras regras.
  IF NOT public.fn_neg_visita_so_papel(p_visita_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.neg_via_papel', 'on', true);
  v := public.neg_resultado_visita(p_visita_id, p_resultado, p_feita);
  PERFORM set_config('app.neg_via_papel', 'off', true);
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_neg_papel_alterar_visita(p_visita_id uuid, p_board_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_titulo text, p_notas text, p_local text, p_recursos uuid[], p_visit_kind text, p_detalhes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  -- 20270105700000: invólucro do Papel no Negócio. Verifica o encaminhamento e chama a RPC com os privilégios do dono (sem as políticas
  -- de negocios/schedule_items/levantamentos, que só olham para a organização); a RPC re-verifica o papel e todas as outras regras.
  IF NOT public.fn_neg_visita_so_papel(p_visita_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.neg_via_papel', 'on', true);
  v := public.neg_alterar_visita(p_visita_id, p_board_id, p_inicio, p_fim, p_titulo, p_notas, p_local, p_recursos, p_visit_kind, p_detalhes);
  PERFORM set_config('app.neg_via_papel', 'off', true);
  RETURN v;
END $function$;

-- ------------------------------------------------------------------ fn_levantamentos_validar_ligacoes
CREATE OR REPLACE FUNCTION public.fn_levantamentos_validar_ligacoes(p_organization_id uuid, p_entity_id uuid, p_feito_por uuid, p_visita_id uuid, p_negocio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_visita record;
BEGIN
  -- Guarda de organização antes de qualquer leitura (mensagem genérica).
  PERFORM public.fn_levantamentos_exigir_organizacao(p_organization_id);

  IF p_feito_por IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.anew_memberships m
    WHERE m.user_id = p_feito_por
      AND m.organization_id = p_organization_id
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Quem fez o levantamento tem de ser membro activo da organização.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_visita_id IS NOT NULL THEN
    SELECT s.organization_id, s.entity_id, s.contact_id, s.deal_id,
           s.time_off_type, s.vacation_id
      INTO v_visita
    FROM public.schedule_items s
    WHERE s.id = p_visita_id;

    IF NOT FOUND OR v_visita.organization_id IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'A visita indicada não existe nesta organização.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_visita.entity_id IS NOT NULL THEN
      -- A visita liga à entidade (20261228200000): tem de ser a pessoa do
      -- levantamento, e nunca uma ausência ou umas férias.
      IF v_visita.entity_id IS DISTINCT FROM p_entity_id
         OR v_visita.time_off_type IS NOT NULL
         OR v_visita.vacation_id IS NOT NULL THEN
        RAISE EXCEPTION 'A visita indicada é de outra pessoa.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_visita.contact_id IS NOT NULL
       OR v_visita.deal_id IS NOT NULL
       OR v_visita.time_off_type IS NOT NULL
       OR v_visita.vacation_id IS NOT NULL THEN
      -- D5: sem pessoa só se aceita uma visita "solta" (sem contacto, negócio,
      -- ausência nem férias): nunca uma folga, umas férias ou uma reunião de
      -- outra pessoa.
      RAISE EXCEPTION 'A visita indicada é de outra pessoa ou não é uma visita.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_negocio_id IS NOT NULL THEN
    -- Negócio vivo, da mesma organização e pessoa e, com sessão, com
    -- pessoas.edit de quem liga sobre esse negócio (espelha negocios_update:
    -- chave org:*, org:assigned_to ou org:created_by). Uma só mensagem para
    -- "não existe", "é de outra pessoa", "está no lixo" e "sem acesso".
    IF NOT EXISTS (
      SELECT 1 FROM public.negocios n
      WHERE n.id = p_negocio_id
        AND n.organization_id = p_organization_id
        AND n.entity_id = p_entity_id
        AND n.deleted_at IS NULL
        AND (
          v_uid IS NULL
          -- 20270105700000: ou o Papel no Negócio, num negócio onde conta (fn_neg_papel_conta)
          OR public.fn_neg_papel_conta(n.id)
          OR (
            public.has_anew_permission(v_uid, 'pessoas.edit')
            AND EXISTS (
              SELECT 1
              FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
              WHERE k.scope_key = n.organization_id::text || ':*'
                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'O negócio indicado não está disponível para ligar a este levantamento.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Serializa as ligações ao mesmo negócio: a segunda espera pelo fim da
    -- primeira e, com um snapshot novo, vê-a. Assim "já tem levantamento"
    -- dá esta mensagem e não o erro 23505 do UNIQUE (que mostraria o uuid).
    PERFORM pg_advisory_xact_lock(
      hashtextextended('levantamentos.negocio_id:' || p_negocio_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.negocio_id = p_negocio_id
    ) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END;
$function$;

-- ------------------------------------------------------------------ fn_neg_visita_editavel
CREATE OR REPLACE FUNCTION public.fn_neg_visita_editavel(p_visita_id uuid, p_aceitar_cancelada boolean)
 RETURNS schedule_items
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
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
     OR v_vis.entity_id IS NULL THEN
    RAISE EXCEPTION 'Visita indisponível.' USING ERRCODE = 'NG017';
  END IF;

  -- 20270105700000: ou o Papel no Negócio, na visita de um negócio onde o papel conta (fn_neg_papel_conta)
  IF NOT ((public.has_anew_permission(auth.uid(), 'pessoas.edit')
          AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                      WHERE k.scope_key = v_vis.organization_id::text || ':*'
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.created_by::text
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.user_id::text))
          OR (v_vis.negocio_id IS NOT NULL AND public.fn_neg_papel_conta(v_vis.negocio_id))) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270105200000: a visita de um negócio pede também negocios.visita.gerir
  IF v_vis.negocio_id IS NOT NULL AND NOT public.fn_cat_pode(v_vis.organization_id, 'negocios.visita.gerir') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.visita.gerir): não pode alterar nem cancelar visitas do negócio.' USING ERRCODE = 'insufficient_privilege';
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

-- ------------------------------------------------------------------ neg_perder_negocio
CREATE OR REPLACE FUNCTION public.neg_perder_negocio(p_negocio_id uuid, p_fase text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg    public.negocios;
  v_motivo text := btrim(p_motivo);
BEGIN
  -- 20270105700000: quem só tem o Papel no Negócio (sem pessoas.edit com âmbito sobre este negócio) entra pelo invólucro DEFINER
  IF coalesce(current_setting('app.neg_via_papel', true), '') <> 'on' AND public.fn_neg_negocio_so_papel(p_negocio_id) THEN
    RETURN public.fn_neg_papel_perder_negocio(p_negocio_id, p_fase, p_motivo);
  END IF;

  IF p_fase IS NULL OR p_fase NOT IN
     ('lead', 'contacto', 'visita', 'levantamento', 'orcamento', 'proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: fase da perda.' USING ERRCODE = 'NG009';
  END IF;
  IF v_motivo IS NULL OR v_motivo = '' OR char_length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: motivo da perda (1 a 1000 caracteres).' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto', 'perdido']);

  -- 20270105200000: além do pessoas.edit (as políticas de negocios), pede negocios.perder
  IF NOT public.fn_cat_pode(v_neg.organization_id, 'negocios.perder') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.perder): não pode dar o negócio como perdido.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_neg.estado = 'perdido' AND v_neg.fase_perda = p_fase AND v_neg.motivo_perda = v_motivo THEN
    RETURN jsonb_build_object('mudou', false, 'estado', 'perdido');
  END IF;

  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE public.negocios n
  SET estado = 'perdido', fase_perda = p_fase, motivo_perda = v_motivo
  WHERE n.id = v_neg.id;
  PERFORM set_config('app.neg_via_funcao', 'off', true);

  RETURN jsonb_build_object('mudou', true, 'estado', 'perdido');
END;
$function$;

-- ------------------------------------------------------------------ neg_anular_perda
CREATE OR REPLACE FUNCTION public.neg_anular_perda(p_negocio_id uuid, p_motivo_reabertura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg    public.negocios;
  v_motivo text := btrim(p_motivo_reabertura);
BEGIN
  -- 20270105700000: quem só tem o Papel no Negócio entra pelo invólucro DEFINER
  IF coalesce(current_setting('app.neg_via_papel', true), '') <> 'on' AND public.fn_neg_negocio_so_papel(p_negocio_id) THEN
    RETURN public.fn_neg_papel_anular_perda(p_negocio_id, p_motivo_reabertura);
  END IF;

  IF v_motivo IS NULL OR v_motivo = '' OR char_length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: razão da reabertura (1 a 1000 caracteres).' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto', 'perdido']);

  -- 20270105200000: além do pessoas.edit (as políticas de negocios), pede negocios.perder
  IF NOT public.fn_cat_pode(v_neg.organization_id, 'negocios.perder') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.perder): não pode anular a perda do negócio.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_neg.estado = 'aberto' THEN
    RETURN jsonb_build_object('mudou', false, 'estado', 'aberto');
  END IF;

  PERFORM set_config('app.negocio_motivo_reabertura', v_motivo, true);
  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE public.negocios n
  SET estado = 'aberto', fase_perda = NULL, motivo_perda = NULL
  WHERE n.id = v_neg.id;
  PERFORM set_config('app.neg_via_funcao', 'off', true);
  PERFORM set_config('app.negocio_motivo_reabertura', '', true);

  RETURN jsonb_build_object('mudou', true, 'estado', 'aberto');
END;
$function$;

-- ------------------------------------------------------------------ neg_registar_contacto
CREATE OR REPLACE FUNCTION public.neg_registar_contacto(p_id uuid, p_organization_id uuid, p_entity_id uuid, p_resultado text, p_nota text DEFAULT NULL::text, p_quando timestamp with time zone DEFAULT now(), p_proxima_acao_em timestamp with time zone DEFAULT NULL::timestamp with time zone, p_negocio_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg    public.negocios;
  v_quando timestamptz := COALESCE(p_quando, now());
  v_nota   text := NULLIF(btrim(p_nota), '');
  v_ex     public.entity_interactions;
  v_n      int;
  -- 20270105700000: a entrar pelo invólucro do Papel no Negócio (re-verificado aqui)
  v_papel  boolean := p_negocio_id IS NOT NULL AND coalesce(current_setting('app.neg_via_papel', true), '') = 'on' AND public.fn_neg_papel_conta(p_negocio_id);
BEGIN
  IF p_negocio_id IS NOT NULL AND coalesce(current_setting('app.neg_via_papel', true), '') <> 'on' AND public.fn_neg_negocio_so_papel(p_negocio_id) THEN
    RETURN public.fn_neg_papel_registar_contacto(p_id, p_organization_id, p_entity_id, p_resultado, p_nota, p_quando, p_proxima_acao_em, p_negocio_id);
  END IF;
  IF p_id IS NULL OR p_resultado IS NULL OR p_resultado NOT IN
     ('atendeuInteressado', 'atendeuMaisTarde', 'naoAtendeu', 'semInteresse', 'numeroErrado') THEN
    RAISE EXCEPTION 'Valor inválido: identificador ou resultado do contacto.' USING ERRCODE = 'NG009';
  END IF;
  IF char_length(v_nota) > 2000 THEN
    RAISE EXCEPTION 'Valor inválido: nota com mais de 2000 caracteres.' USING ERRCODE = 'NG009';
  END IF;
  IF v_quando > now() + interval '5 minutes' OR v_quando < timestamptz '2000-01-01 00:00:00+00' THEN
    RAISE EXCEPTION 'Valor inválido: data do contacto.' USING ERRCODE = 'NG009';
  END IF;
  IF p_proxima_acao_em < v_quando - interval '1 day' OR p_proxima_acao_em > now() + interval '5 years' THEN
    RAISE EXCEPTION 'Valor inválido: data da próxima acção.' USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);

  IF NOT (public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.create')
          OR public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit') OR v_papel) THEN
    RAISE EXCEPTION 'Sem permissão para registar contactos nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ordem de bloqueio: negócio primeiro.
  IF p_negocio_id IS NOT NULL THEN
    SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);
    IF v_neg.organization_id <> p_organization_id OR v_neg.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    -- 20270105200000: o contacto ligado a um negócio pede também negocios.contacto.registar
    IF NOT public.fn_cat_pode(p_organization_id, 'negocios.contacto.registar') THEN
      RAISE EXCEPTION 'Sem permissão (negocios.contacto.registar): não pode registar contactos do negócio.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- pelo papel, a pessoa é a do negócio (verificado acima: v_neg.entity_id = p_entity_id)
  IF NOT v_papel THEN
    PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  END IF;

  INSERT INTO public.entity_interactions
    (id, entity_id, organization_id, root_organization_id, interaction_type, result,
     subject, notes, interaction_at, next_action_type, next_action_date, created_by, negocio_id)
  VALUES
    (p_id, p_entity_id, p_organization_id, public.resolve_root_organization_id(p_organization_id),
     'call', p_resultado, 'Contacto', v_nota, v_quando,
     CASE WHEN p_proxima_acao_em IS NOT NULL THEN 'callback' END, p_proxima_acao_em,
     public.fn_neg_actor()::text, p_negocio_id)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    -- Reenvio: devolve o que existe, se for desta pessoa e organização.
    SELECT i.* INTO v_ex FROM public.entity_interactions i WHERE i.id = p_id;
    IF NOT FOUND OR v_ex.organization_id IS DISTINCT FROM p_organization_id
       OR v_ex.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    RETURN jsonb_build_object('contacto_id', p_id, 'mudou', false, 'ligado_a', v_ex.negocio_id);
  END IF;

  RETURN jsonb_build_object('contacto_id', p_id, 'mudou', true, 'ligado_a', p_negocio_id);
END;
$function$;

-- ------------------------------------------------------------------ neg_guardar_levantamento
CREATE OR REPLACE FUNCTION public.neg_guardar_levantamento(p_id uuid, p_organization_id uuid, p_entity_id uuid, p_dados jsonb, p_linhas jsonb, p_respostas jsonb, p_negocio_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg       public.negocios;
  v_lev       public.levantamentos;
  v_dados     jsonb := COALESCE(p_dados, '{}'::jsonb);
  v_linhas    jsonb := COALESCE(p_linhas, '[]'::jsonb);
  v_respostas jsonb := COALESCE(p_respostas, '{}'::jsonb);
  v_data      date;
  v_visita    uuid;
  v_feito_por uuid;
  v_criado    boolean;
  v_ligado    uuid;
  v_n         int;
  -- 20261226090000: questionário configurável.
  v_versao    integer;
  v_versao_cl integer;
  v_res       jsonb;
  v_erro      text;
  -- 20261231100000: morada da obra e a sua origem.
  v_rua       text;
  v_cp        text;
  v_loc       text;
  v_andar     text;
  v_origem_cl text;
  v_origem    text;
  v_igual_ent boolean;
  -- 20270105700000: a entrar pelo invólucro do Papel no Negócio (re-verificado aqui)
  v_papel     boolean := p_negocio_id IS NOT NULL AND coalesce(current_setting('app.neg_via_papel', true), '') = 'on' AND public.fn_neg_papel_conta(p_negocio_id);
BEGIN
  IF p_negocio_id IS NOT NULL AND coalesce(current_setting('app.neg_via_papel', true), '') <> 'on' AND public.fn_neg_negocio_so_papel(p_negocio_id) THEN
    RETURN public.fn_neg_papel_guardar_levantamento(p_id, p_organization_id, p_entity_id, p_dados, p_linhas, p_respostas, p_negocio_id);
  END IF;
  IF p_id IS NULL
     OR jsonb_typeof(v_dados) <> 'object'
     OR jsonb_typeof(v_linhas) <> 'array'
     OR jsonb_typeof(v_respostas) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: identificador, dados, linhas ou respostas.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_array_length(v_linhas) > 200
     OR (SELECT count(*) FROM jsonb_object_keys(v_respostas)) > 200 THEN
    RAISE EXCEPTION 'Valor inválido: até 200 linhas e 200 respostas.' USING ERRCODE = 'NG009';
  END IF;
  BEGIN
    v_data      := (v_dados ->> 'data_levantamento')::date;
    v_visita    := (v_dados ->> 'visita_id')::uuid;
    v_feito_por := (v_dados ->> 'feito_por')::uuid;
    v_versao_cl := (v_dados ->> 'versao_questionario')::integer;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
              OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Valor inválido: data, visita, autor ou versão do questionário.' USING ERRCODE = 'NG009';
  END;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'Valor inválido: falta a data do levantamento.' USING ERRCODE = 'NG009';
  END IF;

  -- 20261231100000: morada da obra; a origem pode vir do ecrã ('entidade',
  -- 'manual' ou 'localizacao'); 'entidade' ou nada é a base que decide (abaixo).
  v_rua       := NULLIF(btrim(v_dados ->> 'morada_rua'), '');
  v_cp        := NULLIF(btrim(v_dados ->> 'morada_codigo_postal'), '');
  v_loc       := NULLIF(btrim(v_dados ->> 'morada_localidade'), '');
  v_andar     := NULLIF(btrim(v_dados ->> 'morada_andar'), '');
  v_origem_cl := NULLIF(btrim(v_dados ->> 'morada_origem'), '');
  IF v_origem_cl IS NOT NULL AND v_origem_cl NOT IN ('entidade', 'manual', 'localizacao') THEN
    RAISE EXCEPTION 'Valor inválido: origem da morada (entidade, manual ou localizacao).' USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 20261226090000: o questionário da organização. Bloqueio PARTILHADO, o mesmo
  -- que neg_guardar_questionario toma em exclusivo: as respostas validam-se e
  -- gravam-se contra uma configuração que não muda a meio (e o tipo de uma
  -- pergunta não muda enquanto se grava uma resposta a ela).
  PERFORM pg_advisory_xact_lock_shared(
    hashtextextended('levantamento_questionario:' || p_organization_id::text, 0));
  SELECT q.versao INTO v_versao
  FROM public.levantamento_questionario q
  WHERE q.organization_id = p_organization_id;
  IF v_versao IS NULL AND v_respostas <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  -- Validação e snapshot das respostas (sob RLS), ANTES de escrever.
  -- 20261231100000: pelo helper e só a aba 'visita'; uma resposta a uma pergunta
  -- da aba Qualificação é NG009 (a Qualificação grava-se no negócio, por
  -- neg_guardar_qualificacao).
  v_res := public.fn_neg_validar_respostas(p_organization_id, v_respostas, 'visita');

  -- Ordem de bloqueio: negócio primeiro (ligação feita no fim).
  IF p_negocio_id IS NOT NULL THEN
    SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);
    IF v_neg.organization_id <> p_organization_id OR v_neg.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    IF EXISTS (SELECT 1 FROM public.levantamentos o
               WHERE o.negocio_id = p_negocio_id AND o.id <> p_id) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.' USING ERRCODE = 'NG013';
    END IF;
    -- 20270105200000: o levantamento (diagnóstico no local) de um negócio pede também negocios.visita.gerir
    IF NOT public.fn_cat_pode(p_organization_id, 'negocios.visita.gerir') THEN
      RAISE EXCEPTION 'Sem permissão (negocios.visita.gerir): não pode gravar o levantamento do negócio.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NOT v_papel THEN
    PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  END IF;

  -- 20261231100000: origem da morada. Sem morada: NULL. 'manual' ou
  -- 'localizacao' enviados pelo ecrã ficam como vieram. Senão (nada ou
  -- 'entidade'), derivação pura: 'entidade' se os 4 campos forem iguais à
  -- morada principal em vigor da pessoa (como a ficha a mostra), senão 'manual'.
  IF v_rua IS NULL AND v_cp IS NULL AND v_loc IS NULL AND v_andar IS NULL THEN
    v_origem := NULL;
  ELSIF v_origem_cl IN ('manual', 'localizacao') THEN
    v_origem := v_origem_cl;
  ELSE
    v_igual_ent := EXISTS (
      SELECT 1
      FROM (SELECT NULLIF(btrim(concat_ws(' ', a.street, a.number)), '') AS rua,
                   NULLIF(btrim(a.postal_code), '') AS cp,
                   NULLIF(btrim(a.city), '') AS loc,
                   NULLIF(btrim(a.floor), '') AS andar
            FROM public.anew_entity_addresses ea
            JOIN public.anew_addresses a ON a.id = ea.address_id
            WHERE ea.entity_id = p_entity_id
              AND (ea.valid_to IS NULL OR ea.valid_to > now())
            ORDER BY ea.is_primary IS TRUE DESC, ea.created_at DESC, ea.id DESC
            LIMIT 1) m
      WHERE m.rua IS NOT DISTINCT FROM v_rua AND m.cp IS NOT DISTINCT FROM v_cp
        AND m.loc IS NOT DISTINCT FROM v_loc AND m.andar IS NOT DISTINCT FROM v_andar);
    v_origem := CASE WHEN v_igual_ent THEN 'entidade' ELSE 'manual' END;
  END IF;

  -- 1. CRIAR (sem negocio_id) ou alterar o existente.
  INSERT INTO public.levantamentos
    (id, organization_id, entity_id, visita_id, feito_por, data_levantamento, estado, notas,
     morada_rua, morada_codigo_postal, morada_localidade, morada_andar, morada_origem)
  VALUES
    (p_id, p_organization_id, p_entity_id, v_visita, v_feito_por, v_data,
     COALESCE(NULLIF(v_dados ->> 'estado', ''), 'por_fazer'),
     NULLIF(btrim(v_dados ->> 'notas'), ''),
     v_rua, v_cp, v_loc, v_andar, v_origem)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_criado := v_n > 0;

  IF NOT v_criado THEN
    SELECT lv.* INTO v_lev FROM public.levantamentos lv WHERE lv.id = p_id;
    IF NOT FOUND OR v_lev.organization_id <> p_organization_id OR v_lev.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    IF v_lev.negocio_id IS NOT NULL THEN
      IF v_lev.negocio_id = p_negocio_id THEN
        RETURN jsonb_build_object('levantamento_id', p_id, 'criado', false, 'mudou', false,
                                  'ligado_a', v_lev.negocio_id,
                                  'versao_questionario', v_versao,
                                  'questionario_mudou', v_versao_cl IS NOT NULL
                                                        AND v_versao_cl IS DISTINCT FROM v_versao);
      END IF;
      RAISE EXCEPTION 'Este levantamento já está ligado a um negócio e não se altera; registe um novo.'
        USING ERRCODE = 'NG005';
    END IF;

    UPDATE public.levantamentos lv
    SET visita_id            = v_visita,
        feito_por            = COALESCE(v_feito_por, lv.feito_por),
        data_levantamento    = v_data,
        estado               = COALESCE(NULLIF(v_dados ->> 'estado', ''), lv.estado),
        notas                = NULLIF(btrim(v_dados ->> 'notas'), ''),
        morada_rua           = v_rua,
        morada_codigo_postal = v_cp,
        morada_localidade    = v_loc,
        morada_andar         = v_andar,
        -- a morada não mudou e o ecrã não mandou origem: mantém a guardada
        -- (assim um levantamento 'localizacao' não passa a 'manual' só por se
        -- gravarem as notas); origem explícita ganha sempre.
        morada_origem        = CASE
          WHEN v_origem IS NULL THEN NULL
          WHEN v_origem_cl IS NULL
               AND lv.morada_origem IS NOT NULL
               AND lv.morada_rua IS NOT DISTINCT FROM v_rua
               AND lv.morada_codigo_postal IS NOT DISTINCT FROM v_cp
               AND lv.morada_localidade IS NOT DISTINCT FROM v_loc
               AND lv.morada_andar IS NOT DISTINCT FROM v_andar THEN lv.morada_origem
          ELSE v_origem END
    WHERE lv.id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Sem permissão para alterar o levantamento.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 2. PREENCHER: linhas por substituição completa, na ordem recebida.
  DELETE FROM public.levantamento_linhas ll WHERE ll.levantamento_id = p_id;
  BEGIN
    INSERT INTO public.levantamento_linhas
      (levantamento_id, organization_id, divisao, trabalho, trabalho_outro, medida, unidade,
       observacoes, ordem)
    SELECT p_id, p_organization_id,
           e.valor ->> 'divisao',
           e.valor ->> 'trabalho',
           NULLIF(btrim(e.valor ->> 'trabalho_outro'), ''),
           (e.valor ->> 'medida')::numeric,
           COALESCE(NULLIF(e.valor ->> 'unidade', ''), 'm2'),
           NULLIF(btrim(e.valor ->> 'observacoes'), ''),
           (e.posicao - 1)::int
    FROM jsonb_array_elements(v_linhas) WITH ORDINALITY AS e(valor, posicao);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Valor inválido: medida de uma linha do levantamento.' USING ERRCODE = 'NG009';
  END;

  -- Respostas: as enviadas (upsert, sem id no payload) e apagar as que deixaram de vir.
  -- 20261226090000: validadas acima; o snapshot (tipo, textos, secção, ordem) só
  -- se escreve quando a resposta é nova ou o valor mudou, para que mudar a
  -- configuração não altere o que já foi respondido.
  INSERT INTO public.levantamento_respostas AS lr
    (levantamento_id, organization_id, seccao, pergunta, resposta, tipo, pergunta_texto,
     seccao_titulo, bloco, ordem, escolhas, escolhas_texto, valor_texto, valor_numero)
  SELECT p_id, p_organization_id, x.seccao, x.pergunta, x.resposta, x.tipo, x.pergunta_texto,
         x.seccao_titulo, x.bloco, x.ordem, x.escolhas, x.escolhas_texto, x.valor_texto, x.valor_numero
  FROM jsonb_to_recordset(v_res) AS x(pergunta text, seccao text, resposta text, tipo text,
         pergunta_texto text, seccao_titulo text, bloco text, ordem integer, escolhas text[],
         escolhas_texto text[], valor_texto text, valor_numero numeric)
  LEFT JOIN public.levantamento_respostas a
    ON a.levantamento_id = p_id AND a.pergunta = x.pergunta
  WHERE a.id IS NULL
     OR a.tipo IS DISTINCT FROM x.tipo
     OR a.resposta IS DISTINCT FROM x.resposta
     OR a.valor_texto IS DISTINCT FROM x.valor_texto
     OR a.valor_numero IS DISTINCT FROM x.valor_numero
     OR ARRAY(SELECT u.c FROM unnest(a.escolhas) AS u(c) ORDER BY u.c)
        IS DISTINCT FROM ARRAY(SELECT u.c FROM unnest(x.escolhas) AS u(c) ORDER BY u.c)
  ON CONFLICT (levantamento_id, pergunta)
  DO UPDATE SET seccao = EXCLUDED.seccao, resposta = EXCLUDED.resposta, tipo = EXCLUDED.tipo,
                pergunta_texto = EXCLUDED.pergunta_texto, seccao_titulo = EXCLUDED.seccao_titulo,
                bloco = EXCLUDED.bloco, ordem = EXCLUDED.ordem, escolhas = EXCLUDED.escolhas,
                escolhas_texto = EXCLUDED.escolhas_texto, valor_texto = EXCLUDED.valor_texto,
                valor_numero = EXCLUDED.valor_numero;

  DELETE FROM public.levantamento_respostas lr
  WHERE lr.levantamento_id = p_id
    AND NOT (v_respostas ? lr.pergunta);

  -- 3. LIGAR (o trigger valida um por negócio e a permissão).
  IF p_negocio_id IS NOT NULL THEN
    UPDATE public.levantamentos lv SET negocio_id = p_negocio_id WHERE lv.id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 1 THEN
      v_ligado := p_negocio_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('levantamento_id', p_id, 'criado', v_criado, 'mudou', true,
                            'ligado_a', v_ligado,
                            'versao_questionario', v_versao,
                            'questionario_mudou', v_versao_cl IS NOT NULL
                                                  AND v_versao_cl IS DISTINCT FROM v_versao);
END;
$function$;

-- ------------------------------------------------------------------ neg_resultado_visita
CREATE OR REPLACE FUNCTION public.neg_resultado_visita(p_visita_id uuid, p_resultado text, p_feita boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vis      record;
  v_entity   uuid;
  v_cliente  boolean;
  v_feita    boolean := COALESCE(p_feita, false);
  v_concluir boolean;
  v_mudou    boolean := false;
  v_motivo   text;
  v_n        int;
BEGIN
  -- 20270105700000: quem só tem o Papel no Negócio entra pelo invólucro DEFINER
  IF coalesce(current_setting('app.neg_via_papel', true), '') <> 'on' AND public.fn_neg_visita_so_papel(p_visita_id) THEN
    RETURN public.fn_neg_papel_resultado_visita(p_visita_id, p_resultado, p_feita);
  END IF;
  IF p_visita_id IS NULL
     OR (p_resultado IS NULL AND NOT v_feita)
     OR p_resultado NOT IN ('interessado', 'aPensar', 'semInteresse', 'obraInviavel') THEN
    RAISE EXCEPTION 'Valor inválido: resultado da visita.' USING ERRCODE = 'NG009';
  END IF;

  SELECT s.organization_id, s.negocio_id, s.entity_id, s.visit_outcome, s.status,
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
  IF NOT ((public.has_anew_permission(auth.uid(), 'pessoas.edit')
          AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                      WHERE k.scope_key = v_vis.organization_id::text || ':*'
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.created_by::text
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.user_id::text))
          -- 20270105700000: ou o Papel no Negócio (só a entrar pelo invólucro, re-verificado)
          OR (v_vis.negocio_id IS NOT NULL AND coalesce(current_setting('app.neg_via_papel', true), '') = 'on' AND public.fn_neg_papel_conta(v_vis.negocio_id))) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270105200000: a visita de um negócio pede também negocios.visita.gerir
  IF v_vis.negocio_id IS NOT NULL AND NOT public.fn_cat_pode(v_vis.organization_id, 'negocios.visita.gerir') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.visita.gerir): não pode dar resultado às visitas do negócio.' USING ERRCODE = 'insufficient_privilege';
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

  -- 20261228200000: a pessoa é a entidade viva da visita, na mesma
  -- organização; a abordagem é a dela (anew_entities.closure_result). Só uma
  -- entidade lead (client_since nulo) se encerra: um cliente dá 'sem_lead'.
  SELECT e.id, e.client_since IS NOT NULL INTO v_entity, v_cliente
  FROM public.anew_entities e
  WHERE e.id = v_vis.entity_id AND e.organization_id = v_vis.organization_id
    AND e.deleted_at IS NULL;

  IF v_vis.negocio_id IS NOT NULL THEN
    v_motivo := 'visita_de_negocio';
  ELSIF v_entity IS NULL THEN
    v_motivo := 'sem_pessoa';
  ELSIF public.fn_neg_tem_negocio_aberto(v_vis.organization_id, v_entity) THEN
    v_motivo := 'negocios_abertos';
  ELSIF v_cliente THEN
    v_motivo := 'sem_lead';
  END IF;

  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', v_motivo);
  END IF;

  v_mudou := (public.fn_neg_mudar_abordagem(
    v_vis.organization_id, v_entity, NULL, p_resultado, NULL, 'Resultado da visita')
    ->> 'mudou')::boolean OR v_mudou;

  RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', true,
                            'motivo_nao_encerrada', NULL);
END;
$function$;

-- ------------------------------------------------------------------ neg_cancelar_visita
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
     AND NOT public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit') THEN
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

-- ------------------------------------------------------------------ neg_alterar_visita
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
              AND NOT public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit');
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

-- ------------------------------------------------------------------ neg_guardar_visita
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
  IF v_papel AND v_neg_id IS NOT NULL AND NOT public.has_scheduling_permission(v_uid, 'scheduling.items.create') THEN
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

-- ------------------------------------------------------------------ obra_guardar_negocio
CREATE OR REPLACE FUNCTION public.obra_guardar_negocio(p_org uuid, p_negocio_id uuid, p_obra jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 20270102220000: o código antigo do papel da obra deu lugar a negocios.obra.planear (o Gestor de obra) e negocios.obra.executar (o técnico)
  v_user uuid := public.fn_cat_exigir_uma(p_org, ARRAY['pessoas.edit', 'negocios.obra.planear', 'negocios.obra.executar']);
  v_existe boolean; v_planear boolean; v_executar boolean; v_eu uuid; v_porque text; s record;
  v_neg negocios; v_obra ops_obra; v_codigo text; v_estado text; v_plano boolean; v_inicio date;
  t jsonb; v_chave text; v_nome text; v_fase uuid; v_tar uuid; v_skill uuid; v_skill_nome text; v_pessoa uuid; v_tarestado text; v_pessoas smallint;
  v_chaves text[] := '{}'; v_avisos text[] := '{}';
  v_imp_a jsonb; v_imp_d jsonb; v_auto_a jsonb; v_auto_d jsonb; -- 20270105200000
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  IF p_obra IS NULL OR jsonb_typeof(p_obra) <> 'object' THEN RAISE EXCEPTION 'A obra tem de ser um objeto.' USING ERRCODE = 'CT002'; END IF;
  v_plano := coalesce(jsonb_typeof(p_obra->'tarefas') = 'array', false);
  v_estado := coalesce(nullif(p_obra->>'estado', ''), 'planeada');
  IF v_estado NOT IN ('planeada', 'em_curso', 'suspensa', 'concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Estado da obra inválido: %.', v_estado USING ERRCODE = 'CT002';
  END IF;
  BEGIN
    v_inicio := nullif(p_obra->>'inicio', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Data de início inválida: %.', p_obra->>'inicio' USING ERRCODE = 'CT002';
  END;

  SELECT * INTO v_obra FROM ops_obra WHERE negocio_id = p_negocio_id AND organization_id = p_org FOR UPDATE;
  v_existe := FOUND;

  -- 20270102220000: sem negocios.obra.planear, compara-se a obra gravada com a nova e só passa o que é de quem executa: as tarefas
  -- atribuídas a ele (ops_obra_tarefa_rh; no estado da Emylia, tasks[i].tec), marcadas em curso ou feitas, com os registos, as
  -- fotografias, as notas e os imprevistos delas (fn_obra_execucao_permitida). Gravar sem mudanças passa sempre. O plano, o estado da
  -- obra, o cancelamento, a atribuição dos técnicos, a validação e as tarefas novas ou apagadas são do Gestor de obra.
  v_planear := public.fn_cat_pode(p_org, 'negocios.obra.planear');
  IF NOT v_planear AND NOT v_existe THEN
    -- a obra nasce do orçamento (o plano gerado, por aprovar, sem nada feito): quem grava o negócio pode criá-la
    IF v_plano AND (v_estado <> 'planeada' OR NOT public.fn_cat_pode(p_org, 'pessoas.edit')
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_obra->'tarefas') x WHERE coalesce(nullif(x->>'estado', ''), 'por_fazer') <> 'por_fazer')) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): só o Gestor de obra cria uma obra que já não está só planeada.' USING ERRCODE = 'CT001';
    END IF;
  ELSIF NOT v_planear THEN
    v_executar := public.fn_cat_pode(p_org, 'negocios.obra.executar');
    v_eu := CASE WHEN v_executar THEN public.fn_neg_pessoa_da_conta(p_org) END;
    IF NOT v_plano OR v_estado IS DISTINCT FROM v_obra.estado THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o estado da obra nem cancelá-la.' USING ERRCODE = 'CT001';
    END IF;
    IF (SELECT coalesce(array_agg(t.chave ORDER BY t.chave), '{}') FROM ops_obra_tarefa t WHERE t.obra_id = v_obra.id)
       IS DISTINCT FROM (SELECT coalesce(array_agg(btrim(x->>'chave') ORDER BY btrim(x->>'chave')), '{}') FROM jsonb_array_elements(p_obra->'tarefas') x) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode juntar nem tirar tarefas do plano.' USING ERRCODE = 'CT001';
    END IF;
    FOR s IN SELECT t.chave, t.nome, t.estado, (SELECT r.pessoa_id FROM ops_obra_tarefa_rh r WHERE r.tarefa_id = t.id LIMIT 1) AS pessoa,
                    CASE WHEN coalesce(nullif(x->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(x->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo,
                    CASE WHEN coalesce(x->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (x->>'pessoa')::uuid END AS nova_pessoa
             FROM ops_obra_tarefa t JOIN jsonb_array_elements(p_obra->'tarefas') x ON btrim(x->>'chave') = t.chave
             WHERE t.obra_id = v_obra.id LOOP
      IF s.nova_pessoa IS DISTINCT FROM s.pessoa THEN
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o técnico da tarefa %.', s.nome USING ERRCODE = 'CT001';
      END IF;
      IF s.novo IS DISTINCT FROM s.estado AND NOT (v_eu IS NOT NULL AND s.pessoa = v_eu AND s.estado <> 'validada' AND s.novo IN ('em_curso', 'feita')) THEN
        -- 20270105500000: sem negocios.obra.executar a falta é essa (não a do Gestor de obra); a regra não muda, só a mensagem
        IF NOT coalesce(v_executar, false) THEN
          RAISE EXCEPTION 'Sem permissão (negocios.obra.executar): não pode marcar a tarefa % em curso ou feita.', s.nome
            USING ERRCODE = 'CT001';
        END IF;
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): na tarefa % só quem a tem atribuída a marca em curso ou feita; validar e pedir correção é do Gestor de obra.', s.nome
          USING ERRCODE = 'CT001';
      END IF;
    END LOOP;
    v_porque := public.fn_obra_execucao_permitida(v_obra.estado_emylia, p_obra->'emylia', v_eu);
    IF v_porque IS NOT NULL THEN
      -- 20270105700000: sem negocios.obra.executar o que falta é ela (não planear)
      RAISE EXCEPTION 'Sem permissão (%): não pode mudar %; só regista a execução das tarefas atribuídas a si.',
        CASE WHEN v_executar THEN 'negocios.obra.planear' ELSE 'negocios.obra.executar' END, v_porque USING ERRCODE = 'CT001';
    END IF;
    -- grava só a execução: o estado da Emylia e o estado das tarefas dele; o resto da projeção (datas, nomes, técnicos) fica o da base
    UPDATE ops_obra SET estado_emylia = p_obra->'emylia', atualizada_em = now()
    WHERE id = v_obra.id AND estado_emylia IS DISTINCT FROM p_obra->'emylia';
    UPDATE ops_obra_tarefa t SET estado = x.novo, atualizada_em = now()
    FROM (SELECT btrim(y->>'chave') AS chave, CASE WHEN coalesce(nullif(y->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(y->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo FROM jsonb_array_elements(p_obra->'tarefas') y) x
    WHERE t.obra_id = v_obra.id AND t.chave = x.chave AND t.estado IS DISTINCT FROM x.novo;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- 20270105200000: daqui para baixo grava quem planeia (ou quem cria a obra só planeada). Por cima disso:
  --   negocios.obra.imprevistos  mudar ou tirar um imprevisto já gravado (propor ao cliente, decidir, fechar). Registar um novo (no fim da
  --                              lista) não a pede: é da execução (fn_obra_execucao_permitida) ou do planeamento.
  --   negocios.obra.fechar       a obra passar a concluída, ou o auto de receção mudar (enviá-lo). A assinatura do auto que o cliente fez no
  --                              portal (negocio_rececao_cliente com o mesmo número) passa sem ela: é o espelho do que já está na base.
  v_imp_a := public.fn_neg_lista(CASE WHEN v_existe THEN v_obra.estado_emylia->'imprevistos' END);
  v_imp_d := public.fn_neg_lista(p_obra->'emylia'->'imprevistos');
  IF (jsonb_array_length(v_imp_d) < jsonb_array_length(v_imp_a)
      OR EXISTS (SELECT 1 FROM generate_series(0, jsonb_array_length(v_imp_a) - 1) i WHERE (v_imp_d->i) IS DISTINCT FROM (v_imp_a->i)))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.imprevistos') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.imprevistos): não pode propor nem decidir os imprevistos da obra.' USING ERRCODE = 'CT001';
  END IF;
  v_auto_a := CASE WHEN v_existe AND jsonb_typeof(v_obra.estado_emylia->'auto') = 'object' THEN v_obra.estado_emylia->'auto' END;
  v_auto_d := CASE WHEN jsonb_typeof(p_obra->'emylia'->'auto') = 'object' THEN p_obra->'emylia'->'auto' END;
  IF ((v_estado = 'concluida' AND (NOT v_existe OR v_obra.estado IS DISTINCT FROM 'concluida'))
      OR (v_auto_d IS DISTINCT FROM v_auto_a
          AND NOT (v_auto_a->>'estado' = 'por assinar' AND v_auto_d->>'estado' = 'assinado' AND v_auto_d->>'n' = v_auto_a->>'n'
                   AND (v_auto_d - ARRAY['estado', 'assinado', 'assinatura', 'reservas']) = (v_auto_a - ARRAY['estado', 'assinado', 'assinatura', 'reservas'])
                   AND EXISTS (SELECT 1 FROM negocio_rececao_cliente r WHERE r.negocio_id = p_negocio_id AND r.auto_n = v_auto_d->>'n'))))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.fechar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.fechar): não pode encerrar a obra nem enviar o auto de receção.' USING ERRCODE = 'CT001';
  END IF;

  IF NOT v_existe THEN
    IF NOT v_plano THEN RETURN jsonb_build_object('obra_id', NULL, 'codigo', NULL, 'avisos', '[]'::jsonb); END IF;
    v_codigo := 'OB-' || coalesce(v_neg.numero::text, left(p_negocio_id::text, 8));
    IF EXISTS (SELECT 1 FROM ops_obra WHERE organization_id = p_org AND codigo = v_codigo) THEN
      v_codigo := v_codigo || '-' || left(replace(gen_random_uuid()::text, '-', ''), 4);
    END IF;
    INSERT INTO ops_obra (organization_id, codigo, negocio_id, titulo, morada, estado, data_inicio_prevista, criada_por, estado_emylia,
                          iniciada_em, concluida_em)
    VALUES (p_org, v_codigo, p_negocio_id,
            coalesce(nullif(btrim(p_obra->>'titulo'), ''), nullif(btrim(v_neg.titulo), ''), 'Obra ' || v_codigo),
            nullif(btrim(coalesce(p_obra->>'morada', '')), ''), v_estado, v_inicio, v_user, p_obra->'emylia',
            CASE WHEN v_estado IN ('em_curso', 'concluida') THEN now() END, CASE WHEN v_estado = 'concluida' THEN now() END)
    RETURNING * INTO v_obra;
  ELSE
    UPDATE ops_obra SET
      titulo = coalesce(nullif(btrim(p_obra->>'titulo'), ''), titulo),
      morada = coalesce(nullif(btrim(coalesce(p_obra->>'morada', '')), ''), morada),
      estado = CASE WHEN v_plano THEN v_estado ELSE 'cancelada' END,
      data_inicio_prevista = coalesce(v_inicio, data_inicio_prevista),
      iniciada_em = CASE WHEN v_estado IN ('em_curso', 'concluida') THEN coalesce(iniciada_em, now()) ELSE iniciada_em END,
      concluida_em = CASE WHEN v_estado = 'concluida' THEN coalesce(concluida_em, now()) ELSE concluida_em END,
      estado_emylia = p_obra->'emylia',
      atualizada_em = now()
    WHERE id = v_obra.id
    RETURNING * INTO v_obra;
  END IF;

  IF NOT v_plano THEN
    DELETE FROM ops_obra_tarefa_rh WHERE obra_id = v_obra.id;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- as fases: as que o motor manda e as que as tarefas usam
  INSERT INTO ops_obra_fase (organization_id, obra_id, ordem, nome)
  SELECT p_org, v_obra.id, f.ordem, coalesce(max(f.nome), 'Fase ' || f.ordem)
  FROM (
    SELECT (x->>'ordem')::smallint AS ordem, nullif(btrim(x->>'nome'), '') AS nome
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_obra->'fases') = 'array' THEN p_obra->'fases' ELSE '[]'::jsonb END) x
    UNION ALL
    SELECT coalesce((x->>'fase')::smallint, 0), NULL FROM jsonb_array_elements(p_obra->'tarefas') x
  ) f
  GROUP BY f.ordem
  ON CONFLICT (obra_id, ordem) DO UPDATE SET nome = EXCLUDED.nome WHERE ops_obra_fase.nome IS DISTINCT FROM EXCLUDED.nome;

  FOR t IN SELECT x FROM jsonb_array_elements(p_obra->'tarefas') x LOOP
    v_chave := nullif(btrim(coalesce(t->>'chave', '')), '');
    v_nome := nullif(btrim(coalesce(t->>'nome', '')), '');
    IF v_chave IS NULL OR v_nome IS NULL THEN RAISE EXCEPTION 'Cada tarefa precisa de chave e nome.' USING ERRCODE = 'CT002'; END IF;
    IF v_chave = ANY (v_chaves) THEN RAISE EXCEPTION 'Tarefa repetida: %.', v_chave USING ERRCODE = 'CT002'; END IF;
    v_chaves := v_chaves || v_chave;

    v_skill := NULL; v_skill_nome := NULL;
    IF nullif(t->>'perfil', '') IS NOT NULL THEN
      SELECT k.id, k.nome INTO v_skill, v_skill_nome FROM ops_skill k
      WHERE k.organization_id = p_org AND (k.chave = t->>'perfil' OR k.id::text = t->>'perfil') LIMIT 1;
    END IF;
    SELECT id INTO v_fase FROM ops_obra_fase WHERE obra_id = v_obra.id AND ordem = coalesce((t->>'fase')::smallint, 0);
    v_tarestado := coalesce(nullif(t->>'estado', ''), 'por_fazer');
    IF v_tarestado NOT IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada') THEN v_tarestado := 'por_fazer'; END IF;
    v_pessoas := least(20, greatest(1, coalesce((t->>'pessoas')::int, 1)));

    v_tar := NULL;
    SELECT id INTO v_tar FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND chave = v_chave;
    IF v_tar IS NULL THEN
      INSERT INTO ops_obra_tarefa (organization_id, obra_id, fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado,
                                   estado, skill_id, chave, pessoas_previstas)
      VALUES (p_org, v_obra.id, v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
              nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_chave, v_pessoas)
      RETURNING id INTO v_tar;
    ELSE
      UPDATE ops_obra_tarefa SET fase_id = v_fase, ordem = coalesce((t->>'ordem')::int, 0), nome = v_nome,
        minutos_previstos = greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
        inicio_planeado = nullif(t->>'inicio', '')::date, fim_planeado = nullif(t->>'fim', '')::date,
        estado = v_tarestado, skill_id = v_skill, pessoas_previstas = v_pessoas, atualizada_em = now()
      WHERE id = v_tar
        AND (fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado, estado, skill_id, pessoas_previstas) IS DISTINCT FROM
            (v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
             nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_pessoas);
    END IF;

    -- quem a faz: só uma pessoa do RH desta organização
    v_pessoa := NULL;
    IF coalesce(t->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT p.id INTO v_pessoa FROM pessoas p WHERE p.id = (t->>'pessoa')::uuid AND p.organization_id = p_org AND p.deleted_at IS NULL;
      IF v_pessoa IS NULL THEN
        v_avisos := v_avisos || format('%s: o técnico não é uma pessoa do RH desta organização. Ficou por atribuir.', v_nome);
      ELSIF NOT public.fn_rh_pessoa_tecnica(p_org, v_pessoa) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem um cargo técnico de obra no RH.', v_nome);
      ELSIF v_skill IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fn_rh_oficios_efetivos(p_org, v_pessoa) o WHERE o.skill_id = v_skill) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem o ofício %s no RH.', v_nome, v_skill_nome);
      END IF;
    END IF;
    DELETE FROM ops_obra_tarefa_rh WHERE tarefa_id = v_tar AND pessoa_id IS DISTINCT FROM v_pessoa;
    IF v_pessoa IS NOT NULL THEN
      INSERT INTO ops_obra_tarefa_rh (organization_id, obra_id, tarefa_id, pessoa_id, atribuida_por)
      VALUES (p_org, v_obra.id, v_tar, v_pessoa, v_user)
      ON CONFLICT (tarefa_id, pessoa_id) DO NOTHING;
    END IF;
  END LOOP;

  -- o que saiu do plano sai da projeção (as fases só se nenhuma tarefa as usar)
  DELETE FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND (chave IS NULL OR NOT (chave = ANY (v_chaves)));
  DELETE FROM ops_obra_fase f WHERE f.obra_id = v_obra.id AND NOT EXISTS (SELECT 1 FROM ops_obra_tarefa x WHERE x.fase_id = f.id);

  RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', to_jsonb(v_avisos));
END $function$;

-- Privilégios das funções novas (como as RPCs: só authenticated e service_role)
REVOKE ALL ON FUNCTION public.fn_neg_papel_conta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_papel_conta(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_negocio_so_papel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_negocio_so_papel(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_visita_so_papel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_visita_so_papel(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_papel_perder_negocio(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_papel_perder_negocio(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_papel_anular_perda(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_papel_anular_perda(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_papel_registar_contacto(uuid, uuid, uuid, text, text, timestamp with time zone, timestamp with time zone, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_papel_registar_contacto(uuid, uuid, uuid, text, text, timestamp with time zone, timestamp with time zone, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_papel_guardar_levantamento(uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_papel_guardar_levantamento(uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_papel_cancelar_visita(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_papel_cancelar_visita(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_papel_resultado_visita(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_papel_resultado_visita(uuid, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_papel_alterar_visita(uuid, uuid, timestamp with time zone, timestamp with time zone, text, text, text, uuid[], text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_papel_alterar_visita(uuid, uuid, timestamp with time zone, timestamp with time zone, text, text, text, uuid[], text, jsonb) TO authenticated, service_role;

DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc LIKE '%20270105700000%';
  IF v_n <> 18 THEN
    RAISE EXCEPTION 'CONFERIR: % de 18 funções com a alteração', v_n;
  END IF;
END $do$;
