-- Resolver uma submissão em conflito escolhendo QUAL das duas pessoas é.
--
-- Quando o email aponta para uma pessoa e o telefone para outra, a submissão
-- fica ligada à do email e guarda a do telefone em `conflicting_entity_id`.
-- A interface mostra as duas lado a lado -- mas o botão da segunda estava
-- desactivado, porque esta função escrevia SEMPRE em `v_sub.entity_id` (a do
-- email) e não aceitava nenhum parâmetro a dizer "afinal é a outra". Foi
-- escrita antes de existirem conflitos, quando só havia um candidato possível.
--
-- Passa a aceitar `p_entity_id`. Escolher a segunda pessoa NÃO é registar uma
-- nota do lado dela: é a submissão mudar de dono. Ela passa a apontar à ficha
-- dessa pessoa, deixa de estar ligada à primeira, e a marca de conflito
-- desaparece -- a dúvida ficou resolvida, e uma submissão resolvida não deve
-- continuar a parecer duvidosa.
--
-- GUARDA DE SEGURANÇA: `p_entity_id` só pode ser UMA DAS DUAS candidatas já
-- gravadas na submissão. Sem isso, quem tivesse acesso a esta função podia
-- colar uma submissão a qualquer ficha da organização -- e as submissões
-- trazem email, telefone e morada de quem as preencheu.
--
-- O destino (lead ou cliente) é procurado na organização da submissão, com a
-- mesma precedência do resto do sistema: cliente ganha à lead. Se a pessoa
-- escolhida não tiver nenhum dos dois, recusa-se em vez de deixar a submissão
-- apontada a um registo que não existe.
--
-- Não se pode acrescentar um parâmetro a uma função existente sem criar uma
-- segunda versão e tornar as chamadas de 3 argumentos ambíguas. Por isso a
-- versão antiga é removida e recriada com o parâmetro novo por omissão a NULL:
-- quem chamar com 3 argumentos continua a ter exactamente o comportamento de
-- antes.

DROP FUNCTION IF EXISTS "public"."rpc_resolve_form_submission"("uuid", "text", "jsonb");

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

  -- SECURITY: resolucao de submissoes pendentes e uma acao de System Admin,
  -- alinhada com a restricao ja aplicada na UI (/leads/pending-submissions).
  -- Nao basta pertencer a organizacao da submissao.
  IF NOT public.is_system_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores do sistema podem resolver submissoes pendentes' USING ERRCODE = 'insufficient_privilege';
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
        -- A duvida ficou resolvida: deixa de ser um conflito.
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

GRANT EXECUTE ON FUNCTION "public"."rpc_resolve_form_submission"("uuid", "text", "jsonb", "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."rpc_resolve_form_submission"("uuid", "text", "jsonb", "uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."rpc_resolve_form_submission"("uuid", "text", "jsonb", "uuid") TO "postgres";

COMMENT ON FUNCTION "public"."rpc_resolve_form_submission"("uuid", "text", "jsonb", "uuid") IS
  'Resolve uma submissão pendente. `p_entity_id` escolhe qual das duas candidatas é, nos casos de conflito: a submissão muda de dono, aponta à ficha dessa pessoa e deixa de estar marcada como duvidosa. Só aceita uma das duas candidatas já gravadas na submissão.';
