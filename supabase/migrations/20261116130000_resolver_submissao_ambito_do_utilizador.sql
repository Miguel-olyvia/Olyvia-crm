-- Resolver submissões volta a ser possível a quem trabalha a organização.
--
-- A função exigia `is_system_admin(auth.uid())` e mais nada. Efeito medido na
-- nike: NINGUÉM consegue resolver uma submissão. O papel `system_admin` existe
-- uma única vez, sem organização, e nenhuma conta da nike o tem — quem o tem
-- está noutras organizações. O ecrã abre, mostra os botões, e o clique devolve
-- sempre 403 "Apenas administradores do sistema podem resolver submissoes
-- pendentes". Confirmado ao vivo no browser, e por `SELECT is_system_admin(...)`
-- ao remoto, que devolve false para um Super Admin das 20 organizações.
--
-- DE ONDE VEIO: não desta série de migrations. A migration original desta
-- função, 20261111240000, verificava "system_admin OU membro da organização".
-- A versão que estava viva no remoto quando esta série começou já tinha só o
-- `is_system_admin` -- foi aplicada sem ficheiro no repositório, o mesmo tipo
-- de drift que já obrigou a repor duas migrations de inventário. A migration
-- 20261116120000 copiou fielmente a versão viva ao acrescentar `p_entity_id`,
-- e com ela copiou a restrição. Fica corrigido aqui, com a intenção original.
--
-- O critério reposto é o de 20261111240000, e é o mesmo da política de leitura
-- de `form_submissions`: quem VÊ a submissão pode resolvê-la. Não faz sentido
-- mostrar uma fila com botões a quem a base recusa sempre. Continua a nunca
-- confiar no id que o cliente envia: o âmbito é reconferido do lado do
-- servidor, sobre a organização gravada na própria submissão.
--
-- Só muda a autorização. O `p_entity_id`, as duas guardas das candidatas e
-- todo o resto do corpo ficam exactamente como estão em 20261116120000.

CREATE OR REPLACE FUNCTION "public"."rpc_resolve_form_submission"(
  "p_submission_id" "uuid",
  "p_action" "text",
  "p_field_overrides" "jsonb" DEFAULT NULL,
  "p_entity_id" "uuid" DEFAULT NULL
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor          uuid;
  v_sub            public.form_submissions;
  v_field_values   jsonb;
  v_lead_id        uuid;
  v_interaction_id uuid;
  v_result         jsonb;
  v_entity_id      uuid;
  v_switched       boolean := false;
  v_target_type    text;
  v_target_id      uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action NOT IN ('merge', 'new_lead') THEN
    RAISE EXCEPTION 'Acao invalida: %', p_action USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_sub
  FROM public.form_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Submissao nao encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_sub.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'Submissao ja foi resolvida' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- SECURITY: nunca confiar no ambito enviado pelo cliente. Reconfere-se sobre
  -- a organizacao gravada na submissao, com o mesmo criterio da politica de
  -- leitura de form_submissions.
  IF NOT (
    public.is_system_admin(auth.uid())
    OR v_sub.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    OR v_sub.root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Submissao fora do ambito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador nao encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_field_values := COALESCE(p_field_overrides, v_sub.field_values);

  -- ── Qual das duas pessoas ────────────────────────────────────────────────
  v_entity_id := COALESCE(p_entity_id, v_sub.entity_id);

  IF p_entity_id IS NOT NULL AND p_entity_id <> v_sub.entity_id THEN
    IF v_sub.conflicting_entity_id IS NULL OR p_entity_id <> v_sub.conflicting_entity_id THEN
      RAISE EXCEPTION 'A entidade escolhida nao e uma das candidatas desta submissao'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_switched := true;
  END IF;

  -- ── A submissao muda de dono ─────────────────────────────────────────────
  IF v_switched THEN
    SELECT 'client', c.id INTO v_target_type, v_target_id
    FROM public.anew_clients c
    WHERE c.entity_id = v_entity_id
      AND c.organization_id = v_sub.organization_id
      AND c.deleted_at IS NULL
      AND c.status <> 'inactive'
    ORDER BY c.created_at DESC
    LIMIT 1;

    IF v_target_id IS NULL THEN
      SELECT 'lead', l.id INTO v_target_type, v_target_id
      FROM public.anew_leads l
      WHERE l.entity_id = v_entity_id
        AND l.organization_id = v_sub.organization_id
        AND l.deleted_at IS NULL
        AND l.status NOT IN ('converted', 'lost', 'rejected')
      ORDER BY l.created_at DESC
      LIMIT 1;
    END IF;

    IF v_target_id IS NULL THEN
      RAISE EXCEPTION 'A pessoa escolhida nao tem lead activa nem e cliente nesta organizacao'
        USING ERRCODE = 'no_data_found';
    END IF;

    UPDATE public.form_submissions
    SET entity_id             = v_entity_id,
        target_type           = v_target_type,
        target_id             = v_target_id,
        conflicting_entity_id = NULL
    WHERE id = p_submission_id;
  END IF;

  IF p_action = 'merge' THEN
    INSERT INTO public.entity_interactions (
      entity_id, organization_id, root_organization_id, interaction_type,
      subject, notes, interaction_at, created_by
    ) VALUES (
      v_entity_id, v_sub.organization_id, v_sub.root_organization_id, 'note',
      'Reenvio de formulario associado ao registo existente',
      'Valores submetidos: ' || v_field_values::text,
      now(), v_actor::text
    )
    RETURNING id INTO v_interaction_id;

    UPDATE public.form_submissions
    SET resolved_at = now(),
        resolved_by = v_actor,
        resolution  = 'merged'
    WHERE id = p_submission_id;

    v_result := jsonb_build_object(
      'action', 'merged',
      'interaction_id', v_interaction_id,
      'entity_id', v_entity_id,
      'switched', v_switched
    );

  ELSIF p_action = 'new_lead' THEN
    INSERT INTO public.anew_leads (
      campaign_id, organization_id, root_organization_id, entity_id,
      field_values, status, source, created_by
    ) VALUES (
      v_sub.campaign_id, v_sub.organization_id, v_sub.root_organization_id, v_entity_id,
      v_field_values, 'new', 'form_submission_reclassified', v_actor
    )
    RETURNING id INTO v_lead_id;

    INSERT INTO public.anew_entity_roles (
      organization_id, entity_id, role, status, source_type, source_id, created_by
    ) VALUES (
      v_sub.organization_id, v_entity_id, 'lead', 'active', 'lead', v_lead_id, v_actor
    )
    ON CONFLICT (organization_id, entity_id, role)
    DO UPDATE SET
      status      = 'active',
      source_type = 'lead',
      source_id   = EXCLUDED.source_id;

    UPDATE public.form_submissions
    SET resolved_at = now(),
        resolved_by = v_actor,
        resolution  = 'new_lead'
    WHERE id = p_submission_id;

    v_result := jsonb_build_object(
      'action', 'new_lead',
      'lead_id', v_lead_id,
      'entity_id', v_entity_id,
      'switched', v_switched
    );
  END IF;

  RETURN v_result;
END;
$$;
