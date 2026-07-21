-- Fase 3 §1 (pré-requisito) — rpc_save_lead_workflow_stages ganha os campos
-- de regras.
--
-- Achado ao preparar o editor "Regras": rpc_save_lead_workflow_stages (o
-- único caminho de escrita de lead_workflow_stages a partir da app) só
-- persiste os campos originais (name/label/color/stage_order/is_final/
-- is_conversion/is_rejection/default_status) — matching_statuses/
-- reached_when/auto_advance/qualification_hint/counts_as_* (adicionados na
-- Fase 1, migração 20261110490000) nunca são gravados por esta função.
-- Construir o editor sem corrigir isto primeiro faria a UI "gravar" regras
-- que desapareciam silenciosamente. Corrigido aqui via CREATE OR REPLACE,
-- preservando byte-a-byte a definição viva capturada antes desta migração,
-- com os novos campos acrescentados a ambos os ramos (CREATE/UPDATE) e ao
-- respectivo diff de auditoria.
--
-- Convenção seguida (igual à já existente para default_status): a etapa
-- envia sempre o estado completo desejado, por isso os novos campos são
-- atribuídos directamente a partir do payload (sem COALESCE para o valor
-- anterior) — incluindo o caso de reached_when voltar a NULL (limpar todas
-- as condições), que tem de ser possível.
--
-- matching_statuses cai para ARRAY[name] quando o payload não traz um
-- array válido, para nunca deixar uma etapa sem nenhum status literal
-- associado (o que a faria nunca ser alcançada pelo fallback de regra
-- vazia em stage_reached()).

CREATE OR REPLACE FUNCTION public.rpc_save_lead_workflow_stages(p_organization_id uuid, p_stages jsonb)
 RETURNS SETOF lead_workflow_stages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_elem         jsonb;
  v_order        integer := 0;
  v_id           uuid;
  v_before       public.lead_workflow_stages;
  v_after        public.lead_workflow_stages;
  v_seen_ids     uuid[] := ARRAY[]::uuid[];
  v_row_diff     jsonb;
  v_stage_diffs  jsonb := '{}'::jsonb;
  v_any_change   boolean := false;
  v_matching     text[];
  v_qual_hint    text;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_stages IS NULL OR jsonb_typeof(p_stages) <> 'array' THEN
    RAISE EXCEPTION 'p_stages deve ser um array JSON' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ── Walk the payload in order; order in the array == new stage_order ─────
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_stages)
  LOOP
    v_order := v_order + 1;
    v_id := NULLIF(v_elem->>'id', '')::uuid;

    IF jsonb_typeof(v_elem->'matching_statuses') = 'array' THEN
      v_matching := ARRAY(SELECT jsonb_array_elements_text(v_elem->'matching_statuses'));
    ELSE
      v_matching := ARRAY[v_elem->>'name'];
    END IF;

    v_qual_hint := v_elem->>'qualification_hint';
    IF v_qual_hint NOT IN ('mql', 'sql') THEN
      v_qual_hint := 'none';
    END IF;

    IF v_id IS NULL THEN
      -- ── CREATE ──────────────────────────────────────────────────────────
      INSERT INTO public.lead_workflow_stages
        (organization_id, name, label, color, stage_order,
         is_final, is_conversion, is_rejection, default_status, created_by,
         matching_statuses, reached_when, auto_advance, qualification_hint,
         counts_as_qualified, counts_as_negotiation, counts_as_converted, counts_as_lost)
      VALUES
        (p_organization_id,
         v_elem->>'name',
         v_elem->>'label',
         COALESCE(v_elem->>'color', '#6366f1'),
         v_order,
         COALESCE((v_elem->>'is_final')::boolean, false),
         COALESCE((v_elem->>'is_conversion')::boolean, false),
         COALESCE((v_elem->>'is_rejection')::boolean, false),
         NULLIF(v_elem->>'default_status', ''),
         v_actor,
         v_matching,
         v_elem->'reached_when',
         COALESCE((v_elem->>'auto_advance')::boolean, false),
         v_qual_hint,
         COALESCE((v_elem->>'counts_as_qualified')::boolean, false),
         COALESCE((v_elem->>'counts_as_negotiation')::boolean, false),
         COALESCE((v_elem->>'counts_as_converted')::boolean, false),
         COALESCE((v_elem->>'counts_as_lost')::boolean, false))
      RETURNING * INTO v_after;

      v_stage_diffs := v_stage_diffs || jsonb_build_object(
        v_after.id::text, jsonb_build_object(
          'operation',       'created',
          'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.name)),
          'label',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.label)),
          'color',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.color)),
          'stage_order',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.stage_order)),
          'is_final',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.is_final)),
          'is_conversion',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.is_conversion)),
          'is_rejection',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.is_rejection)),
          'default_status',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.default_status)),
          'matching_statuses', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.matching_statuses)),
          'reached_when',    jsonb_build_object('old', NULL, 'new', v_after.reached_when),
          'auto_advance',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.auto_advance)),
          'qualification_hint', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.qualification_hint)),
          'counts_as_qualified', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.counts_as_qualified)),
          'counts_as_negotiation', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.counts_as_negotiation)),
          'counts_as_converted', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.counts_as_converted)),
          'counts_as_lost', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.counts_as_lost))
        )
      );
      v_any_change := true;
      v_seen_ids := array_append(v_seen_ids, v_after.id);

    ELSE
      -- ── UPDATE (only if it belongs to this org and something changed) ───
      SELECT * INTO v_before
      FROM public.lead_workflow_stages
      WHERE id = v_id AND organization_id = p_organization_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Estágio % não encontrado nesta organização', v_id
          USING ERRCODE = 'no_data_found';
      END IF;

      v_seen_ids := array_append(v_seen_ids, v_id);

      UPDATE public.lead_workflow_stages SET
        label           = COALESCE(v_elem->>'label', label),
        color           = COALESCE(v_elem->>'color', color),
        stage_order     = v_order,
        is_final        = COALESCE((v_elem->>'is_final')::boolean, is_final),
        is_conversion   = COALESCE((v_elem->>'is_conversion')::boolean, is_conversion),
        is_rejection    = COALESCE((v_elem->>'is_rejection')::boolean, is_rejection),
        default_status  = NULLIF(v_elem->>'default_status', ''),
        matching_statuses = v_matching,
        reached_when    = v_elem->'reached_when',
        auto_advance    = COALESCE((v_elem->>'auto_advance')::boolean, false),
        qualification_hint = v_qual_hint,
        counts_as_qualified = COALESCE((v_elem->>'counts_as_qualified')::boolean, false),
        counts_as_negotiation = COALESCE((v_elem->>'counts_as_negotiation')::boolean, false),
        counts_as_converted = COALESCE((v_elem->>'counts_as_converted')::boolean, false),
        counts_as_lost = COALESCE((v_elem->>'counts_as_lost')::boolean, false),
        updated_at      = now()
      WHERE id = v_id
      RETURNING * INTO v_after;

      v_row_diff := '{}'::jsonb;
      IF v_before.label IS DISTINCT FROM v_after.label THEN
        v_row_diff := v_row_diff || jsonb_build_object('label',
          jsonb_build_object('old', to_jsonb(v_before.label), 'new', to_jsonb(v_after.label)));
      END IF;
      IF v_before.color IS DISTINCT FROM v_after.color THEN
        v_row_diff := v_row_diff || jsonb_build_object('color',
          jsonb_build_object('old', to_jsonb(v_before.color), 'new', to_jsonb(v_after.color)));
      END IF;
      IF v_before.stage_order IS DISTINCT FROM v_after.stage_order THEN
        v_row_diff := v_row_diff || jsonb_build_object('stage_order',
          jsonb_build_object('old', to_jsonb(v_before.stage_order), 'new', to_jsonb(v_after.stage_order)));
      END IF;
      IF v_before.is_final IS DISTINCT FROM v_after.is_final THEN
        v_row_diff := v_row_diff || jsonb_build_object('is_final',
          jsonb_build_object('old', to_jsonb(v_before.is_final), 'new', to_jsonb(v_after.is_final)));
      END IF;
      IF v_before.is_conversion IS DISTINCT FROM v_after.is_conversion THEN
        v_row_diff := v_row_diff || jsonb_build_object('is_conversion',
          jsonb_build_object('old', to_jsonb(v_before.is_conversion), 'new', to_jsonb(v_after.is_conversion)));
      END IF;
      IF v_before.is_rejection IS DISTINCT FROM v_after.is_rejection THEN
        v_row_diff := v_row_diff || jsonb_build_object('is_rejection',
          jsonb_build_object('old', to_jsonb(v_before.is_rejection), 'new', to_jsonb(v_after.is_rejection)));
      END IF;
      IF v_before.default_status IS DISTINCT FROM v_after.default_status THEN
        v_row_diff := v_row_diff || jsonb_build_object('default_status',
          jsonb_build_object('old', to_jsonb(v_before.default_status), 'new', to_jsonb(v_after.default_status)));
      END IF;
      IF v_before.matching_statuses IS DISTINCT FROM v_after.matching_statuses THEN
        v_row_diff := v_row_diff || jsonb_build_object('matching_statuses',
          jsonb_build_object('old', to_jsonb(v_before.matching_statuses), 'new', to_jsonb(v_after.matching_statuses)));
      END IF;
      IF v_before.reached_when IS DISTINCT FROM v_after.reached_when THEN
        v_row_diff := v_row_diff || jsonb_build_object('reached_when',
          jsonb_build_object('old', v_before.reached_when, 'new', v_after.reached_when));
      END IF;
      IF v_before.auto_advance IS DISTINCT FROM v_after.auto_advance THEN
        v_row_diff := v_row_diff || jsonb_build_object('auto_advance',
          jsonb_build_object('old', to_jsonb(v_before.auto_advance), 'new', to_jsonb(v_after.auto_advance)));
      END IF;
      IF v_before.qualification_hint IS DISTINCT FROM v_after.qualification_hint THEN
        v_row_diff := v_row_diff || jsonb_build_object('qualification_hint',
          jsonb_build_object('old', to_jsonb(v_before.qualification_hint), 'new', to_jsonb(v_after.qualification_hint)));
      END IF;
      IF v_before.counts_as_qualified IS DISTINCT FROM v_after.counts_as_qualified THEN
        v_row_diff := v_row_diff || jsonb_build_object('counts_as_qualified',
          jsonb_build_object('old', to_jsonb(v_before.counts_as_qualified), 'new', to_jsonb(v_after.counts_as_qualified)));
      END IF;
      IF v_before.counts_as_negotiation IS DISTINCT FROM v_after.counts_as_negotiation THEN
        v_row_diff := v_row_diff || jsonb_build_object('counts_as_negotiation',
          jsonb_build_object('old', to_jsonb(v_before.counts_as_negotiation), 'new', to_jsonb(v_after.counts_as_negotiation)));
      END IF;
      IF v_before.counts_as_converted IS DISTINCT FROM v_after.counts_as_converted THEN
        v_row_diff := v_row_diff || jsonb_build_object('counts_as_converted',
          jsonb_build_object('old', to_jsonb(v_before.counts_as_converted), 'new', to_jsonb(v_after.counts_as_converted)));
      END IF;
      IF v_before.counts_as_lost IS DISTINCT FROM v_after.counts_as_lost THEN
        v_row_diff := v_row_diff || jsonb_build_object('counts_as_lost',
          jsonb_build_object('old', to_jsonb(v_before.counts_as_lost), 'new', to_jsonb(v_after.counts_as_lost)));
      END IF;

      IF v_row_diff <> '{}'::jsonb THEN
        v_stage_diffs := v_stage_diffs || jsonb_build_object(
          v_after.id::text, jsonb_build_object('operation', 'updated') || v_row_diff
        );
        v_any_change := true;
      END IF;
    END IF;
  END LOOP;

  -- ── Soft-delete active stages of this org that were dropped from payload ──
  FOR v_before IN
    SELECT * FROM public.lead_workflow_stages
    WHERE organization_id = p_organization_id
      AND is_active = true
      AND NOT (id = ANY (v_seen_ids))
  LOOP
    UPDATE public.lead_workflow_stages
    SET is_active = false, updated_at = now()
    WHERE id = v_before.id;

    v_stage_diffs := v_stage_diffs || jsonb_build_object(
      v_before.id::text, jsonb_build_object(
        'operation', 'deactivated',
        'is_active', jsonb_build_object('old', to_jsonb(true), 'new', to_jsonb(false)),
        'label',     jsonb_build_object('old', to_jsonb(v_before.label), 'new', to_jsonb(v_before.label))
      )
    );
    v_any_change := true;
  END LOOP;

  IF v_any_change THEN
    PERFORM public.fn_manual_audit_log(
      'lead_workflow_stages', p_organization_id, p_organization_id, 'UPDATE',
      jsonb_build_object('lead_workflow_stages', v_stage_diffs), 'web_app'
    );
  END IF;

  RETURN QUERY
  SELECT * FROM public.lead_workflow_stages
  WHERE organization_id = p_organization_id AND is_active = true
  ORDER BY stage_order;
END;
$function$;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Chamar rpc_save_lead_workflow_stages com um payload que inclua
--    reached_when={"op":"AND","conditions":[{"type":"has_assignee"}]} numa
--    etapa existente e confirmar, por SELECT directo, que a coluna ficou
--    gravada (não NULL) — o bug que esta migração corrige.
-- 2. Confirmar que gravar sem matching_statuses (payload antigo, antes desta
--    Fase 3) continua a funcionar: cai para ARRAY[name], preservando o
--    comportamento anterior a esta migração para chamadores existentes.
-- 3. Confirmar que o diff de auditoria grava as chaves novas apenas quando
--    mudam (UPDATE) ou sempre (CREATE), sem quebrar entity_audit_log.
