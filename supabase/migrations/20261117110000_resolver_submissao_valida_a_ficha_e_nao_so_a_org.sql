-- A fila de submissões pendentes lê por âmbito da ficha e escreve por âmbito
-- da organização. Esta migração alinha as duas.
--
-- A política de leitura `form_submissions_select_org` (20261116090000) só
-- devolve uma submissão a quem já vê a ficha a que ela está ligada: chama
-- `can_access_contact_row` com `leads.view` ou `clients.view` — exactamente
-- como as leads e os clientes fazem nas suas próprias políticas. Um comercial
-- com âmbito próprio recebe as submissões das fichas que criou ou que lhe
-- foram atribuídas, e mais nenhuma.
--
-- O `rpc_resolve_form_submission` não acompanhou. Apesar de 20261116130000 se
-- chamar «ambito do utilizador», o que lá está verifica só a organização:
-- `is_system_admin OR organization_id IN get_user_visible_org_ids(...)`. Quem
-- não consegue LISTAR uma submissão alheia consegue na mesma RESOLVÊ-LA, se
-- souber o identificador. Ninguém o obtém pela aplicação, porque a listagem já
-- vem filtrada — mas «difícil de adivinhar» não é uma permissão, e a barreira
-- estava do lado errado.
--
-- Passa a usar-se a mesma condição da leitura, pela mesma ordem: primeiro a
-- organização, depois a ficha. Não se cria função nova nem regra própria para
-- as submissões — herdam o âmbito das leads e dos clientes, que é onde a ficha
-- vive.
--
-- O resto do corpo é igual ao de 20261116130000, incluindo a escolha da
-- segunda candidata num conflito (`p_entity_id`). Só muda a verificação de
-- acesso. Nada é destrutivo: nenhuma linha é alterada e as submissões já
-- resolvidas continuam resolvidas.

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

  -- SEGURANCA: a mesma condicao da politica de leitura form_submissions_select_org,
  -- e pela mesma ordem. Nunca se confia no ambito enviado pelo cliente: reconfere-se
  -- sobre a organizacao gravada na submissao E sobre a ficha a que ela esta ligada,
  -- com o ambito de leads.view / clients.view da pessoa. Quem nao ve a submissao na
  -- lista tambem nao a resolve por identificador.
  IF NOT (
    v_sub.organization_id IN (
      SELECT public.get_user_crm_org_ids(( SELECT auth.uid() ))
    )
    AND (
      (
        v_sub.target_type = 'lead'
        AND EXISTS (
          SELECT 1
          FROM public.anew_leads l
          WHERE l.id = v_sub.target_id
            AND public.can_access_contact_row(
                  l.organization_id, l.created_by, l.assigned_to, 'leads.view'
                )
        )
      )
      OR (
        v_sub.target_type = 'client'
        AND EXISTS (
          SELECT 1
          FROM public.anew_clients c
          WHERE c.id = v_sub.target_id
            AND public.can_access_contact_row(
                  c.organization_id, c.created_by, c.assigned_to, 'clients.view'
                )
        )
      )
    )
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

COMMENT ON FUNCTION "public"."rpc_resolve_form_submission"("uuid", "text", "jsonb", "uuid") IS
  'Resolve uma submissao pendente. O acesso e o mesmo da politica de leitura form_submissions_select_org: a organizacao tem de estar visivel E a ficha ligada (lead ou cliente) tem de estar dentro do ambito da pessoa, por can_access_contact_row com leads.view / clients.view. Herda o ambito das leads e dos clientes -- nao tem regra propria.';
