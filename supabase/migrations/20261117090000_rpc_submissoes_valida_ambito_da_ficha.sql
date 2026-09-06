-- A fila de submissões pendentes lia por âmbito e escrevia por organização.
--
-- A política de leitura `form_submissions_select_org` (20261116090000) só
-- devolve uma submissão a quem já vê a ficha a que ela está ligada: chama
-- `can_access_contact_row` com `leads.view` ou `clients.view`, exactamente
-- como as leads e os clientes fazem nas suas próprias políticas. Um comercial
-- com âmbito próprio recebe as submissões das fichas que criou ou que lhe
-- foram atribuídas, e mais nenhuma.
--
-- O `rpc_resolve_form_submission` (20261111240000) ficou para trás. Valida
-- apenas que a submissão pertence a uma organização visível — nunca volta a
-- perguntar se a ficha é daquela pessoa. O comentário lá dentro diz que copia
-- a política de leitura «exactamente», e era verdade quando foi escrito: a
-- política só ganhou o âmbito da ficha cinco dias depois, e o RPC não
-- acompanhou.
--
-- Consequência: quem não consegue LISTAR uma submissão alheia consegue na
-- mesma RESOLVÊ-LA, se souber o identificador. Ninguém o obtém pela aplicação,
-- porque a listagem já vem filtrada — mas «difícil de adivinhar» não é uma
-- permissão, e a barreira estava do lado errado.
--
-- Esta migração alinha a escrita com a leitura, usando a mesma condição. Não
-- se cria função nova nem regra própria para as submissões: elas herdam o
-- âmbito das leads e dos clientes, que é onde a ficha vive.
--
-- Nada é destrutivo. O corpo da função é o mesmo de 20261111240000 — só muda
-- a verificação de acesso. Nenhuma linha é alterada e as submissões já
-- resolvidas continuam resolvidas.

CREATE OR REPLACE FUNCTION "public"."rpc_resolve_form_submission"(
  "p_submission_id" "uuid",
  "p_action" "text",
  "p_field_overrides" "jsonb" DEFAULT NULL
)
RETURNS "jsonb"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor          uuid;
  v_sub            public.form_submissions;
  v_field_values   jsonb;
  v_lead_id        uuid;
  v_interaction_id uuid;
  v_result         jsonb;
  v_pode           boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action NOT IN ('merge', 'new_lead') THEN
    RAISE EXCEPTION 'Ação inválida: %', p_action USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_sub
  FROM public.form_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Submissão não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_sub.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'Submissão já foi resolvida' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- SEGURANÇA: a mesma condição da política de leitura, e pela mesma ordem.
  -- Primeiro a organização, depois a ficha. Quem não vê a submissão na lista
  -- também não a resolve por identificador.
  v_pode := (
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
  );

  IF NOT v_pode THEN
    RAISE EXCEPTION 'Submissão fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_field_values := COALESCE(p_field_overrides, v_sub.field_values);

  IF p_action = 'merge' THEN
    INSERT INTO public.entity_interactions (
      entity_id, organization_id, root_organization_id, interaction_type,
      subject, notes, interaction_at, created_by
    ) VALUES (
      v_sub.entity_id, v_sub.organization_id, v_sub.root_organization_id, 'note',
      'Reenvio de formulário associado ao registo existente',
      'Valores submetidos: ' || v_field_values::text,
      now(), v_actor::text
    )
    RETURNING id INTO v_interaction_id;

    UPDATE public.form_submissions
    SET resolved_at = now(),
        resolved_by = v_actor,
        resolution  = 'merged'
    WHERE id = p_submission_id;

    v_result := jsonb_build_object('action', 'merged', 'interaction_id', v_interaction_id);

  ELSIF p_action = 'new_lead' THEN
    INSERT INTO public.anew_leads (
      campaign_id, organization_id, root_organization_id, entity_id,
      field_values, status, source, created_by
    ) VALUES (
      v_sub.campaign_id, v_sub.organization_id, v_sub.root_organization_id, v_sub.entity_id,
      v_field_values, 'new', 'form_submission_reclassified', v_actor
    )
    RETURNING id INTO v_lead_id;

    INSERT INTO public.anew_entity_roles (
      organization_id, entity_id, role, status, source_type, source_id, created_by
    ) VALUES (
      v_sub.organization_id, v_sub.entity_id, 'lead', 'active', 'lead', v_lead_id, v_actor
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

    v_result := jsonb_build_object('action', 'new_lead', 'lead_id', v_lead_id);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION "public"."rpc_resolve_form_submission"("uuid", "text", "jsonb") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."rpc_resolve_form_submission"("uuid", "text", "jsonb") TO "authenticated";

COMMENT ON FUNCTION "public"."rpc_resolve_form_submission"("uuid", "text", "jsonb") IS
  'Resolve uma submissão pendente. O acesso é o mesmo da política de leitura form_submissions_select_org: a organização tem de estar visível E a ficha ligada (lead ou cliente) tem de estar dentro do âmbito da pessoa, por can_access_contact_row com leads.view / clients.view. Herda o âmbito das leads e dos clientes -- não tem regra própria.';
